alter table public.foods drop constraint if exists foods_weight_basis_check;
alter table public.foods add constraint foods_weight_basis_check check (weight_basis in ('raw', 'cooked', 'none'));

alter table public.food_overrides drop constraint if exists food_overrides_weight_basis_check;
alter table public.food_overrides add constraint food_overrides_weight_basis_check check (weight_basis in ('raw', 'cooked', 'none'));
