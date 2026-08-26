alter table public.foods drop constraint if exists foods_category_check;
alter table public.foods add constraint foods_category_check
  check (category = any (array['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text, '食物配料'::text]));

alter table public.food_overrides drop constraint if exists food_overrides_category_check;
alter table public.food_overrides add constraint food_overrides_category_check
  check (category = any (array['主食'::text, '蔬菜'::text, '水果'::text, '肉类'::text, '补剂'::text, '坚果'::text, '食物配料'::text]));

update public.foods set category = '食物配料', updated_at = now()
  where category = '补剂' and (name like '%食用油%' or name like '%橄榄油%' or lower(name) like '%cooking oil%');
update public.food_overrides set category = '食物配料', updated_at = now()
  where category = '补剂' and (name like '%食用油%' or name like '%橄榄油%' or lower(name) like '%cooking oil%');
