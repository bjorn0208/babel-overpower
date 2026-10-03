-- Fix: telefone de número fixo (rifa_numeros_fixos) nunca passava por
-- normalizar_telefone_brasil() — ao contrário de reservar_numeros_rifa_publico,
-- que já normaliza. Resultado: número fixo sem DDI 55, propagado pra
-- pedidos_rifa.phone (via sincronizar_numeros_fixos_rifa) e rifa_dividas.phone
-- (via sortear_rifa) — o link "conversar" (wa.me) saía sem DDI e o WhatsApp
-- acusava "número inexistente" (Theus, 2026-09-01).
--
-- Fix na ORIGEM: trigger normaliza rifa_numeros_fixos.phone (mesma função já
-- usada na reserva pública — mesmo padrão, sem lógica nova). Dali em diante
-- sincronizar_numeros_fixos_rifa e sortear_rifa herdam o valor já certo, sem
-- precisar mexer nas duas funções.
--
-- + backfill do que já tá gravado errado nas 3 tabelas.

create or replace function public.trg_normalizar_telefone_numero_fixo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.phone is not null and new.phone <> '' then
    new.phone := coalesce(public.normalizar_telefone_brasil(new.phone), new.phone);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_numeros_fixos_normaliza_phone on public.rifa_numeros_fixos;
create trigger trg_numeros_fixos_normaliza_phone
  before insert or update of phone on public.rifa_numeros_fixos
  for each row execute function public.trg_normalizar_telefone_numero_fixo();

-- Backfill — só toca a linha se a normalização realmente muda o valor
-- (evita reprocessar telefone já certo ou lixo que a função devolve NULL).
update public.rifa_numeros_fixos
set phone = public.normalizar_telefone_brasil(phone)
where phone is not null and phone <> ''
  and public.normalizar_telefone_brasil(phone) is not null
  and phone <> public.normalizar_telefone_brasil(phone);

-- pedidos_rifa/rifa_dividas: só o formato "10-11 dígitos sem DDI" (o mesmo
-- regex que normalizar_telefone_brasil usa pra decidir se prefixa 55) —
-- telefone que já tem DDI (12-13 dígitos, começa com 55) não é tocado.
update public.pedidos_rifa
set phone = public.normalizar_telefone_brasil(phone)
where phone ~ '^[0-9]{10,11}$';

update public.rifa_dividas
set phone = public.normalizar_telefone_brasil(phone)
where phone is not null and phone ~ '^[0-9]{10,11}$';

;
