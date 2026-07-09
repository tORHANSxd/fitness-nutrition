-- 迁移：食物分类新增「食物配料」（2026-07-09）
-- 说明：.env.local 中的 SUPABASE_DB_URL 密码与 SERVICE_ROLE_KEY 均已失效，无法自动执行 DDL；
--      请在 Supabase Dashboard → SQL Editor 手动运行本文件（幂等，可重复执行）。
-- 影响：不执行的话，「食物库」页新增/编辑分类为「食物配料」的食物会被 CHECK 约束拒绝；
--      计划页内置食用油与临时自定义食物不受影响（不写 foods 表）。

alter table public.foods drop constraint if exists foods_category_check;
alter table public.foods add constraint foods_category_check
  check (category = any (array['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text, '食物配料'::text]));

alter table public.food_overrides drop constraint if exists food_overrides_category_check;
alter table public.food_overrides add constraint food_overrides_category_check
  check (category = any (array['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text, '食物配料'::text]));

-- 线上已有的油类行迁到新分类（公共/用户行 + 用户覆盖行）
update public.foods set category = '食物配料', updated_at = now()
  where category = '补剂' and (name like '%食用油%' or name like '%橄榄油%' or lower(name) like '%cooking oil%');
update public.food_overrides set category = '食物配料', updated_at = now()
  where category = '补剂' and (name like '%食用油%' or name like '%橄榄油%' or lower(name) like '%cooking oil%');
