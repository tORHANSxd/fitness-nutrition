


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


CREATE SCHEMA IF NOT EXISTS "private";


ALTER SCHEMA "private" OWNER TO "postgres";


CREATE SCHEMA IF NOT EXISTS "public";


ALTER SCHEMA "public" OWNER TO "pg_database_owner";


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE OR REPLACE FUNCTION "public"."complete_daily_record_v2"("p_plan_date" "date", "p_profile" "jsonb", "p_meals" "jsonb", "p_result" "jsonb", "p_plan_schema_version" smallint, "p_algorithm_version" "text", "p_integrity_flags" "text"[], "p_actual" "jsonb", "p_target" "jsonb", "p_completed" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_checkin public.daily_checkins%rowtype;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if p_plan_schema_version <> 2 then
    raise exception 'unsupported_plan_schema' using errcode = '22023';
  end if;
  if p_profile ->> 'planDate' is distinct from p_plan_date::text
    or jsonb_typeof(p_meals) is distinct from 'array'
    or jsonb_typeof(p_result) is distinct from 'object'
    or p_actual ->> 'version' is distinct from '2' then
    raise exception 'invalid_daily_record_document' using errcode = '22023';
  end if;

  insert into public.daily_plans as plan (
    user_id,
    plan_date,
    profile,
    meals,
    result,
    schema_version,
    algorithm_version,
    integrity_flags
  ) values (
    v_user_id,
    p_plan_date,
    p_profile,
    p_meals,
    p_result,
    p_plan_schema_version,
    p_algorithm_version,
    coalesce(p_integrity_flags, '{}')
  )
  on conflict (user_id, plan_date) do update set
    profile = excluded.profile,
    meals = excluded.meals,
    result = excluded.result,
    schema_version = excluded.schema_version,
    algorithm_version = excluded.algorithm_version,
    integrity_flags = excluded.integrity_flags;

  insert into public.daily_checkins as checkin (
    user_id,
    plan_date,
    actual,
    target,
    completed
  ) values (
    v_user_id,
    p_plan_date,
    p_actual,
    p_target,
    p_completed
  )
  on conflict (user_id, plan_date) do update set
    actual = excluded.actual,
    target = excluded.target,
    completed = excluded.completed
  returning checkin.* into v_checkin;

  return to_jsonb(v_checkin);
end;
$$;


ALTER FUNCTION "public"."complete_daily_record_v2"("p_plan_date" "date", "p_profile" "jsonb", "p_meals" "jsonb", "p_result" "jsonb", "p_plan_schema_version" smallint, "p_algorithm_version" "text", "p_integrity_flags" "text"[], "p_actual" "jsonb", "p_target" "jsonb", "p_completed" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."import_user_foods_v1"("p_rows" "jsonb", "p_atomic" boolean DEFAULT true) RETURNS "jsonb"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_item jsonb;
  v_index integer := 0;
  v_inserted integer := 0;
  v_errors jsonb := '[]'::jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;
  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'rows_must_be_an_array' using errcode = '22023';
  end if;

  for v_item in select value from jsonb_array_elements(p_rows)
  loop
    begin
      if jsonb_typeof(v_item) is distinct from 'object'
        or nullif(btrim(v_item ->> 'name'), '') is null
        or v_item ->> 'category' not in ('主食', '蔬菜', '水果', '肉类', '补剂', '坚果', '食物配料')
        or v_item ->> 'weight_basis' not in ('raw', 'cooked', 'none')
        or jsonb_typeof(v_item -> 'kcal_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'fat_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'carbs_per_100g') is distinct from 'number'
        or jsonb_typeof(v_item -> 'protein_per_100g') is distinct from 'number'
        or (v_item ->> 'kcal_per_100g')::numeric < 0
        or (v_item ->> 'fat_per_100g')::numeric < 0
        or (v_item ->> 'carbs_per_100g')::numeric < 0
        or (v_item ->> 'protein_per_100g')::numeric < 0
        or (
          v_item ? 'cooked_raw_ratio'
          and v_item -> 'cooked_raw_ratio' <> 'null'::jsonb
          and (
            jsonb_typeof(v_item -> 'cooked_raw_ratio') is distinct from 'number'
            or (v_item ->> 'cooked_raw_ratio')::numeric <= 0
          )
        ) then
        raise exception 'invalid_food_row_%', v_index using errcode = '22023';
      end if;

      insert into public.foods (
        user_id,
        name,
        category,
        kcal_per_100g,
        fat_per_100g,
        carbs_per_100g,
        protein_per_100g,
        weight_basis,
        cooked_raw_ratio,
        source
      ) values (
        v_user_id,
        btrim(v_item ->> 'name'),
        v_item ->> 'category',
        (v_item ->> 'kcal_per_100g')::numeric,
        (v_item ->> 'fat_per_100g')::numeric,
        (v_item ->> 'carbs_per_100g')::numeric,
        (v_item ->> 'protein_per_100g')::numeric,
        v_item ->> 'weight_basis',
        case
          when v_item -> 'cooked_raw_ratio' is null or v_item -> 'cooked_raw_ratio' = 'null'::jsonb then null
          else (v_item ->> 'cooked_raw_ratio')::numeric
        end,
        'user'
      );
      v_inserted := v_inserted + 1;
    exception when others then
      if p_atomic then
        raise;
      end if;
      v_errors := v_errors || jsonb_build_array(jsonb_build_object(
        'index', v_index,
        'message', sqlerrm
      ));
    end;
    v_index := v_index + 1;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'errors', v_errors);
end;
$$;


ALTER FUNCTION "public"."import_user_foods_v1"("p_rows" "jsonb", "p_atomic" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."save_planner_draft_v2"("p_plan_date" "date", "p_profile_snapshot" "jsonb", "p_meals" "jsonb", "p_schema_version" smallint DEFAULT 2, "p_expected_revision" bigint DEFAULT NULL::bigint, "p_force" boolean DEFAULT false) RETURNS TABLE("revision" bigint, "updated_at" timestamp with time zone)
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_revision bigint;
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_schema_version <> 2 then
    raise exception 'unsupported_draft_schema' using errcode = '22023';
  end if;

  if p_force then
    insert into public.planner_drafts as draft (
      user_id,
      plan_date,
      profile_snapshot,
      meals,
      schema_version,
      revision
    ) values (
      v_user_id,
      p_plan_date,
      p_profile_snapshot,
      p_meals,
      p_schema_version,
      1
    )
    on conflict (user_id) do update set
      plan_date = excluded.plan_date,
      profile_snapshot = excluded.profile_snapshot,
      meals = excluded.meals,
      schema_version = excluded.schema_version,
      revision = draft.revision + 1
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  elsif p_expected_revision is null then
    insert into public.planner_drafts as draft (
      user_id,
      plan_date,
      profile_snapshot,
      meals,
      schema_version,
      revision
    ) values (
      v_user_id,
      p_plan_date,
      p_profile_snapshot,
      p_meals,
      p_schema_version,
      1
    )
    on conflict (user_id) do nothing
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  else
    update public.planner_drafts as draft
    set
      plan_date = p_plan_date,
      profile_snapshot = p_profile_snapshot,
      meals = p_meals,
      schema_version = p_schema_version,
      revision = draft.revision + 1
    where draft.user_id = v_user_id
      and draft.revision = p_expected_revision
    returning draft.revision, draft.updated_at
      into v_revision, v_updated_at;
  end if;

  if v_revision is null then
    raise exception 'draft_conflict' using errcode = '40001';
  end if;

  update public.profiles
  set preferences = jsonb_set(
    coalesce(preferences, '{}'::jsonb),
    '{plannerDraft}',
    jsonb_build_object(
      'profile', p_profile_snapshot,
      'meals', p_meals,
      'updatedAt', v_updated_at
    ),
    true
  )
  where id = v_user_id;

  return query select v_revision, v_updated_at;
end;
$$;


ALTER FUNCTION "public"."save_planner_draft_v2"("p_plan_date" "date", "p_profile_snapshot" "jsonb", "p_meals" "jsonb", "p_schema_version" smallint, "p_expected_revision" bigint, "p_force" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_deload_week_v1"("p_week_start" "date", "p_enabled" boolean) RETURNS "void"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
declare
  v_user_id uuid := (select auth.uid());
  v_legacy_weeks jsonb;
begin
  if v_user_id is null then
    raise exception 'authentication_required' using errcode = '42501';
  end if;

  if p_enabled then
    insert into public.deload_weeks (user_id, week_start)
    values (v_user_id, p_week_start)
    on conflict (user_id, week_start) do nothing;
  else
    delete from public.deload_weeks
    where user_id = v_user_id
      and week_start = p_week_start;
  end if;

  select coalesce(
    jsonb_agg(to_char(week_start, 'YYYY-MM-DD') order by week_start),
    '[]'::jsonb
  )
  into v_legacy_weeks
  from public.deload_weeks
  where user_id = v_user_id;

  update public.profiles
  set preferences = jsonb_set(
    coalesce(preferences, '{}'::jsonb),
    '{deloadWeeks}',
    v_legacy_weeks,
    true
  )
  where id = v_user_id;
end;
$$;


ALTER FUNCTION "public"."set_deload_week_v1"("p_week_start" "date", "p_enabled" boolean) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."set_updated_at"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO ''
    AS $$
begin
  new.updated_at = now();
  return new;
end;
$$;


ALTER FUNCTION "public"."set_updated_at"() OWNER TO "postgres";

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "private"."health_sync_credentials" (
    "user_id" "uuid" NOT NULL,
    "token_hash" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_used_at" timestamp with time zone,
    "revoked_at" timestamp with time zone
);


ALTER TABLE "private"."health_sync_credentials" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."body_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "weight_kg" numeric(6,2),
    "waist_cm" numeric(6,2),
    "chest_cm" numeric(6,2),
    "hip_cm" numeric(6,2),
    "shoulder_cm" numeric(6,2),
    "upper_arm_cm" numeric(6,2),
    "thigh_cm" numeric(6,2),
    "calf_cm" numeric(6,2),
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "body_fat_pct" numeric(5,2)
);


ALTER TABLE "public"."body_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_checkins" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "actual" "jsonb" NOT NULL,
    "vegetable_grams" numeric(7,2) DEFAULT 0 NOT NULL,
    "water_liters" numeric(5,2) DEFAULT 0 NOT NULL,
    "steps" integer DEFAULT 0 NOT NULL,
    "post_workout_carbs" numeric(7,2) DEFAULT 0 NOT NULL,
    "post_workout_protein" numeric(7,2) DEFAULT 0 NOT NULL,
    "sleep_hours" numeric(4,2) DEFAULT 0 NOT NULL,
    "hunger_level" integer,
    "mood_level" integer,
    "completed" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "target" "jsonb",
    CONSTRAINT "daily_checkins_hunger_level_check" CHECK ((("hunger_level" IS NULL) OR (("hunger_level" >= 1) AND ("hunger_level" <= 5)))),
    CONSTRAINT "daily_checkins_mood_level_check" CHECK ((("mood_level" IS NULL) OR (("mood_level" >= 1) AND ("mood_level" <= 5))))
);


ALTER TABLE "public"."daily_checkins" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."daily_plans" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "profile" "jsonb" NOT NULL,
    "meals" "jsonb" NOT NULL,
    "result" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schema_version" smallint DEFAULT 1 NOT NULL,
    "algorithm_version" "text",
    "integrity_flags" "text"[] DEFAULT '{}'::"text"[] NOT NULL
);


ALTER TABLE "public"."daily_plans" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."deload_weeks" (
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."deload_weeks" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_import_cache" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "provider" "text" NOT NULL,
    "query" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "expires_at" timestamp with time zone NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."food_import_cache" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."food_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "base_food_id" "text" NOT NULL,
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "kcal_per_100g" numeric(8,2) NOT NULL,
    "fat_per_100g" numeric(8,2) NOT NULL,
    "carbs_per_100g" numeric(8,2) NOT NULL,
    "protein_per_100g" numeric(8,2) NOT NULL,
    "weight_basis" "text" NOT NULL,
    "cooked_raw_ratio" numeric(8,3),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "food_overrides_carbs_per_100g_check" CHECK (("carbs_per_100g" >= (0)::numeric)),
    CONSTRAINT "food_overrides_category_check" CHECK (("category" = ANY (ARRAY['主食'::"text", '蔬菜'::"text", '水果'::"text", '肉类'::"text", '补剂'::"text", '坚果'::"text", '食物配料'::"text"]))),
    CONSTRAINT "food_overrides_cooked_raw_ratio_check" CHECK ((("cooked_raw_ratio" IS NULL) OR ("cooked_raw_ratio" > (0)::numeric))),
    CONSTRAINT "food_overrides_fat_per_100g_check" CHECK (("fat_per_100g" >= (0)::numeric)),
    CONSTRAINT "food_overrides_kcal_per_100g_check" CHECK (("kcal_per_100g" >= (0)::numeric)),
    CONSTRAINT "food_overrides_protein_per_100g_check" CHECK (("protein_per_100g" >= (0)::numeric)),
    CONSTRAINT "food_overrides_weight_basis_check" CHECK (("weight_basis" = ANY (ARRAY['raw'::"text", 'cooked'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."food_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."foods" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "name" "text" NOT NULL,
    "category" "text" NOT NULL,
    "kcal_per_100g" numeric(8,2) NOT NULL,
    "fat_per_100g" numeric(8,2) NOT NULL,
    "carbs_per_100g" numeric(8,2) NOT NULL,
    "protein_per_100g" numeric(8,2) NOT NULL,
    "weight_basis" "text" NOT NULL,
    "cooked_raw_ratio" numeric(8,3),
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "external_id" "text",
    "brand" "text",
    "serving_description" "text",
    "source" "text" DEFAULT 'user'::"text" NOT NULL,
    "archived_at" timestamp with time zone,
    CONSTRAINT "foods_carbs_per_100g_check" CHECK (("carbs_per_100g" >= (0)::numeric)),
    CONSTRAINT "foods_category_check" CHECK (("category" = ANY (ARRAY['主食'::"text", '蔬菜'::"text", '水果'::"text", '肉类'::"text", '补剂'::"text", '坚果'::"text", '食物配料'::"text"]))),
    CONSTRAINT "foods_cooked_raw_ratio_check" CHECK ((("cooked_raw_ratio" IS NULL) OR ("cooked_raw_ratio" > (0)::numeric))),
    CONSTRAINT "foods_fat_per_100g_check" CHECK (("fat_per_100g" >= (0)::numeric)),
    CONSTRAINT "foods_kcal_per_100g_check" CHECK (("kcal_per_100g" >= (0)::numeric)),
    CONSTRAINT "foods_protein_per_100g_check" CHECK (("protein_per_100g" >= (0)::numeric)),
    CONSTRAINT "foods_weight_basis_check" CHECK (("weight_basis" = ANY (ARRAY['raw'::"text", 'cooked'::"text", 'none'::"text"])))
);


ALTER TABLE "public"."foods" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."measurement_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "week_start" "date" NOT NULL,
    "avg_weight_kg" numeric(6,2),
    "waist_cm" numeric(6,2),
    "chest_cm" numeric(6,2),
    "hip_cm" numeric(6,2),
    "shoulder_cm" numeric(6,2),
    "upper_arm_cm" numeric(6,2),
    "thigh_cm" numeric(6,2),
    "calf_cm" numeric(6,2),
    "photo_urls" "text"[] DEFAULT '{}'::"text"[] NOT NULL,
    "main_lifts" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."measurement_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_day_overrides" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "calendar_date" "date" NOT NULL,
    "plan_day_number" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "plan_day_overrides_plan_day_number_check" CHECK ((("plan_day_number" >= 1) AND ("plan_day_number" <= 84)))
);


ALTER TABLE "public"."plan_day_overrides" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."plan_instances" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "start_date" "date" NOT NULL,
    "use_platform_stage" boolean DEFAULT true NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "custom_targets" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."plan_instances" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_drafts" (
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "profile_snapshot" "jsonb" NOT NULL,
    "meals" "jsonb" NOT NULL,
    "schema_version" smallint DEFAULT 2 NOT NULL,
    "revision" bigint DEFAULT 1 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "planner_drafts_revision_check" CHECK (("revision" > 0)),
    CONSTRAINT "planner_drafts_schema_version_check" CHECK (("schema_version" > 0))
);


ALTER TABLE "public"."planner_drafts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."planner_templates" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "template_type" "text" NOT NULL,
    "name" "text" NOT NULL,
    "payload" "jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "schema_version" smallint DEFAULT 1 NOT NULL,
    "fingerprint" "text",
    CONSTRAINT "planner_templates_template_type_check" CHECK (("template_type" = ANY (ARRAY['meal'::"text", 'day'::"text"])))
);


ALTER TABLE "public"."planner_templates" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text",
    "display_name" "text",
    "sex" "text",
    "birth_year" integer,
    "height_cm" numeric(6,2),
    "starting_weight_kg" numeric(6,2),
    "preferences" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "locale" "text",
    "time_zone" "text",
    "time_zone_mode" "text" DEFAULT 'auto'::"text" NOT NULL,
    "week_starts_on" smallint DEFAULT 1 NOT NULL,
    "unit_system" "text" DEFAULT 'metric'::"text" NOT NULL,
    "energy_unit" "text" DEFAULT 'kcal'::"text" NOT NULL,
    "hour_cycle" "text" DEFAULT 'h23'::"text" NOT NULL,
    "theme" "text" DEFAULT 'system'::"text" NOT NULL,
    "reduce_motion" boolean,
    "heatmap_palette" "text" DEFAULT 'red-positive'::"text" NOT NULL,
    CONSTRAINT "profiles_energy_unit_check" CHECK (("energy_unit" = ANY (ARRAY['kcal'::"text", 'kj'::"text"]))),
    CONSTRAINT "profiles_heatmap_palette_check" CHECK (("heatmap_palette" = ANY (ARRAY['red-positive'::"text", 'green-positive'::"text"]))),
    CONSTRAINT "profiles_hour_cycle_check" CHECK (("hour_cycle" = ANY (ARRAY['h12'::"text", 'h23'::"text"]))),
    CONSTRAINT "profiles_locale_check" CHECK ((("locale" IS NULL) OR ("locale" = ANY (ARRAY['zh-CN'::"text", 'en'::"text"])))),
    CONSTRAINT "profiles_sex_check" CHECK (("sex" = ANY (ARRAY['male'::"text", 'female'::"text"]))),
    CONSTRAINT "profiles_theme_check" CHECK (("theme" = ANY (ARRAY['system'::"text", 'light'::"text", 'dark'::"text"]))),
    CONSTRAINT "profiles_time_zone_mode_check" CHECK (("time_zone_mode" = ANY (ARRAY['auto'::"text", 'fixed'::"text"]))),
    CONSTRAINT "profiles_unit_system_check" CHECK (("unit_system" = ANY (ARRAY['metric'::"text", 'imperial'::"text"]))),
    CONSTRAINT "profiles_week_starts_on_check" CHECK ((("week_starts_on" >= 0) AND ("week_starts_on" <= 6)))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


COMMENT ON COLUMN "public"."profiles"."locale" IS 'UI locale; null until first-login device detection completes.';



COMMENT ON COLUMN "public"."profiles"."time_zone" IS 'IANA time zone used when time_zone_mode is fixed; last detected zone in auto mode.';



COMMENT ON COLUMN "public"."profiles"."reduce_motion" IS 'Null follows the operating-system preference; true/false is an explicit override.';



CREATE TABLE IF NOT EXISTS "public"."training_logs" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "plan_date" "date" NOT NULL,
    "movement" "text" NOT NULL,
    "load_kg" numeric(7,2),
    "sets" integer,
    "reps" integer,
    "rpe" numeric(4,2),
    "notes" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."training_logs" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."workout_sessions" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid" NOT NULL,
    "session_date" "date" NOT NULL,
    "split_label" "text" NOT NULL,
    "bodyweight_kg" numeric(6,2),
    "recovery" smallint,
    "note" "text",
    "sets" "jsonb" DEFAULT '[]'::"jsonb" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "workout_sessions_bodyweight_kg_check" CHECK ((("bodyweight_kg" IS NULL) OR ("bodyweight_kg" > (0)::numeric))),
    CONSTRAINT "workout_sessions_recovery_check" CHECK ((("recovery" IS NULL) OR (("recovery" >= 1) AND ("recovery" <= 5))))
);


ALTER TABLE "public"."workout_sessions" OWNER TO "postgres";


ALTER TABLE ONLY "private"."health_sync_credentials"
    ADD CONSTRAINT "health_sync_credentials_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."body_logs"
    ADD CONSTRAINT "body_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."body_logs"
    ADD CONSTRAINT "body_logs_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_user_id_plan_date_key" UNIQUE ("user_id", "plan_date");



ALTER TABLE ONLY "public"."deload_weeks"
    ADD CONSTRAINT "deload_weeks_pkey" PRIMARY KEY ("user_id", "week_start");



ALTER TABLE ONLY "public"."food_import_cache"
    ADD CONSTRAINT "food_import_cache_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_import_cache"
    ADD CONSTRAINT "food_import_cache_provider_query_key" UNIQUE ("provider", "query");



ALTER TABLE ONLY "public"."food_overrides"
    ADD CONSTRAINT "food_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."food_overrides"
    ADD CONSTRAINT "food_overrides_user_id_base_food_id_key" UNIQUE ("user_id", "base_food_id");



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurement_logs"
    ADD CONSTRAINT "measurement_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."measurement_logs"
    ADD CONSTRAINT "measurement_logs_user_id_week_start_key" UNIQUE ("user_id", "week_start");



ALTER TABLE ONLY "public"."plan_day_overrides"
    ADD CONSTRAINT "plan_day_overrides_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."plan_day_overrides"
    ADD CONSTRAINT "plan_day_overrides_user_id_calendar_date_key" UNIQUE ("user_id", "calendar_date");



ALTER TABLE ONLY "public"."plan_instances"
    ADD CONSTRAINT "plan_instances_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."planner_drafts"
    ADD CONSTRAINT "planner_drafts_pkey" PRIMARY KEY ("user_id");



ALTER TABLE ONLY "public"."planner_templates"
    ADD CONSTRAINT "planner_templates_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."training_logs"
    ADD CONSTRAINT "training_logs_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_user_id_session_date_key" UNIQUE ("user_id", "session_date");



CREATE INDEX "body_logs_user_date_idx" ON "public"."body_logs" USING "btree" ("user_id", "plan_date");



CREATE INDEX "daily_checkins_user_date_idx" ON "public"."daily_checkins" USING "btree" ("user_id", "plan_date");



CREATE INDEX "daily_plans_user_date_id_idx" ON "public"."daily_plans" USING "btree" ("user_id", "plan_date" DESC, "id" DESC);



CREATE INDEX "food_import_cache_expiry_idx" ON "public"."food_import_cache" USING "btree" ("provider", "query", "expires_at");



CREATE INDEX "foods_user_active_idx" ON "public"."foods" USING "btree" ("user_id", "category", "name") WHERE ("archived_at" IS NULL);



CREATE UNIQUE INDEX "plan_instances_one_active_per_user" ON "public"."plan_instances" USING "btree" ("user_id") WHERE ("active" = true);



CREATE INDEX "planner_templates_user_created_idx" ON "public"."planner_templates" USING "btree" ("user_id", "created_at" DESC);



CREATE INDEX "training_logs_user_date_idx" ON "public"."training_logs" USING "btree" ("user_id", "plan_date");



CREATE OR REPLACE TRIGGER "set_body_logs_updated_at" BEFORE UPDATE ON "public"."body_logs" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_daily_checkins_updated_at" BEFORE UPDATE ON "public"."daily_checkins" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_daily_plans_updated_at" BEFORE UPDATE ON "public"."daily_plans" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_food_overrides_updated_at" BEFORE UPDATE ON "public"."food_overrides" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_foods_updated_at" BEFORE UPDATE ON "public"."foods" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_planner_drafts_updated_at" BEFORE UPDATE ON "public"."planner_drafts" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_planner_templates_updated_at" BEFORE UPDATE ON "public"."planner_templates" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_profiles_updated_at" BEFORE UPDATE ON "public"."profiles" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



CREATE OR REPLACE TRIGGER "set_workout_sessions_updated_at" BEFORE UPDATE ON "public"."workout_sessions" FOR EACH ROW EXECUTE FUNCTION "public"."set_updated_at"();



ALTER TABLE ONLY "private"."health_sync_credentials"
    ADD CONSTRAINT "health_sync_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."body_logs"
    ADD CONSTRAINT "body_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_checkins"
    ADD CONSTRAINT "daily_checkins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."daily_plans"
    ADD CONSTRAINT "daily_plans_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."deload_weeks"
    ADD CONSTRAINT "deload_weeks_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."food_overrides"
    ADD CONSTRAINT "food_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."foods"
    ADD CONSTRAINT "foods_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."measurement_logs"
    ADD CONSTRAINT "measurement_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_day_overrides"
    ADD CONSTRAINT "plan_day_overrides_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."plan_instances"
    ADD CONSTRAINT "plan_instances_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_drafts"
    ADD CONSTRAINT "planner_drafts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."planner_templates"
    ADD CONSTRAINT "planner_templates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."training_logs"
    ADD CONSTRAINT "training_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."workout_sessions"
    ADD CONSTRAINT "workout_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "authenticated users manage own body logs" ON "public"."body_logs" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own daily checkins" ON "public"."daily_checkins" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own daily plans" ON "public"."daily_plans" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own deload weeks" ON "public"."deload_weeks" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own measurement logs" ON "public"."measurement_logs" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own plan day overrides" ON "public"."plan_day_overrides" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own plan instances" ON "public"."plan_instances" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own planner draft" ON "public"."planner_drafts" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own planner templates" ON "public"."planner_templates" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own training logs" ON "public"."training_logs" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "authenticated users manage own workout sessions" ON "public"."workout_sessions" TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."body_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_checkins" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."daily_plans" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "delete own food overrides" ON "public"."food_overrides" FOR DELETE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



ALTER TABLE "public"."deload_weeks" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "deny browser access to legacy food import cache" ON "public"."food_import_cache" TO "authenticated" USING (false) WITH CHECK (false);



ALTER TABLE "public"."food_import_cache" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."food_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."foods" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "insert own food overrides" ON "public"."food_overrides" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert own foods" ON "public"."foods" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "insert own profile" ON "public"."profiles" FOR INSERT TO "authenticated" WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."measurement_logs" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_day_overrides" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."plan_instances" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_drafts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."planner_templates" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "read own food overrides" ON "public"."food_overrides" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "read own profile" ON "public"."profiles" FOR SELECT TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id"));



CREATE POLICY "read public and own foods" ON "public"."foods" FOR SELECT TO "authenticated" USING ((("user_id" IS NULL) OR (( SELECT "auth"."uid"() AS "uid") = "user_id")));



ALTER TABLE "public"."training_logs" ENABLE ROW LEVEL SECURITY;


CREATE POLICY "update own food overrides" ON "public"."food_overrides" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update own foods" ON "public"."foods" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "user_id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "user_id"));



CREATE POLICY "update own profile" ON "public"."profiles" FOR UPDATE TO "authenticated" USING ((( SELECT "auth"."uid"() AS "uid") = "id")) WITH CHECK ((( SELECT "auth"."uid"() AS "uid") = "id"));



ALTER TABLE "public"."workout_sessions" ENABLE ROW LEVEL SECURITY;


GRANT USAGE ON SCHEMA "private" TO "service_role";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";



REVOKE ALL ON FUNCTION "public"."complete_daily_record_v2"("p_plan_date" "date", "p_profile" "jsonb", "p_meals" "jsonb", "p_result" "jsonb", "p_plan_schema_version" smallint, "p_algorithm_version" "text", "p_integrity_flags" "text"[], "p_actual" "jsonb", "p_target" "jsonb", "p_completed" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."complete_daily_record_v2"("p_plan_date" "date", "p_profile" "jsonb", "p_meals" "jsonb", "p_result" "jsonb", "p_plan_schema_version" smallint, "p_algorithm_version" "text", "p_integrity_flags" "text"[], "p_actual" "jsonb", "p_target" "jsonb", "p_completed" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."import_user_foods_v1"("p_rows" "jsonb", "p_atomic" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."import_user_foods_v1"("p_rows" "jsonb", "p_atomic" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."save_planner_draft_v2"("p_plan_date" "date", "p_profile_snapshot" "jsonb", "p_meals" "jsonb", "p_schema_version" smallint, "p_expected_revision" bigint, "p_force" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."save_planner_draft_v2"("p_plan_date" "date", "p_profile_snapshot" "jsonb", "p_meals" "jsonb", "p_schema_version" smallint, "p_expected_revision" bigint, "p_force" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_deload_week_v1"("p_week_start" "date", "p_enabled" boolean) FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."set_deload_week_v1"("p_week_start" "date", "p_enabled" boolean) TO "authenticated";



REVOKE ALL ON FUNCTION "public"."set_updated_at"() FROM PUBLIC;



GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "private"."health_sync_credentials" TO "service_role";



GRANT ALL ON TABLE "public"."body_logs" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."body_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."daily_checkins" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."daily_checkins" TO "authenticated";



GRANT ALL ON TABLE "public"."daily_plans" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."daily_plans" TO "authenticated";



GRANT ALL ON TABLE "public"."deload_weeks" TO "service_role";
GRANT SELECT,INSERT,DELETE ON TABLE "public"."deload_weeks" TO "authenticated";



GRANT ALL ON TABLE "public"."food_import_cache" TO "service_role";



GRANT ALL ON TABLE "public"."food_overrides" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."food_overrides" TO "authenticated";



GRANT ALL ON TABLE "public"."foods" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."foods" TO "authenticated";



GRANT ALL ON TABLE "public"."measurement_logs" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."measurement_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."plan_day_overrides" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."plan_day_overrides" TO "authenticated";



GRANT ALL ON TABLE "public"."plan_instances" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."plan_instances" TO "authenticated";



GRANT ALL ON TABLE "public"."planner_drafts" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."planner_drafts" TO "authenticated";



GRANT ALL ON TABLE "public"."planner_templates" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."planner_templates" TO "authenticated";



GRANT ALL ON TABLE "public"."profiles" TO "service_role";
GRANT SELECT,INSERT,UPDATE ON TABLE "public"."profiles" TO "authenticated";



GRANT ALL ON TABLE "public"."training_logs" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."training_logs" TO "authenticated";



GRANT ALL ON TABLE "public"."workout_sessions" TO "service_role";
GRANT SELECT,INSERT,DELETE,UPDATE ON TABLE "public"."workout_sessions" TO "authenticated";



ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT UPDATE ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT REFERENCES,TRIGGER,TRUNCATE,MAINTAIN ON TABLES TO "service_role";
