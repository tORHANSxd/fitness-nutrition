-- Extend catalog categories without changing IDs, data, ownership, grants or RLS.
alter table public.foods drop constraint if exists foods_category_check;
alter table public.foods add constraint foods_category_check
  check (category in ('主食', '蔬菜', '水果', '肉类', '豆类', '乳制品', '补剂', '坚果', '其他', '食物配料'));
alter table public.food_overrides drop constraint if exists food_overrides_category_check;
alter table public.food_overrides add constraint food_overrides_category_check
  check (category in ('主食', '蔬菜', '水果', '肉类', '豆类', '乳制品', '补剂', '坚果', '其他', '食物配料'));

-- Preserve the existing atomic import contract and authenticated ownership checks.
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
        or v_item ->> 'category' not in ('主食', '蔬菜', '水果', '肉类', '豆类', '乳制品', '补剂', '坚果', '其他', '食物配料')
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
