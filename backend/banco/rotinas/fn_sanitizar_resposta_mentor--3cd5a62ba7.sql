CREATE OR REPLACE FUNCTION public.fn_sanitizar_resposta_mentor()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v text;
begin
  if new.papel <> 'assistant' or new.conteudo is null or new.conteudo = '' then
    return new;
  end if;
  v := new.conteudo;
  v := regexp_replace(v, '\s*isso responde [àa] pergunta\.?', '', 'gi');
  v := regexp_replace(v, '^.*posso ignorar( silenciosamente)?.*$', '', 'gin');
  v := regexp_replace(v, '^\s*o prompt (de |do )?sistema (diz|pede|manda).*$', '', 'gin');
  v := regexp_replace(v, '^\s*portanto: ["“].*$', '', 'gin');
  v := regexp_replace(v, '^\s*conforme (o prompt|as regras|as instru[cç][oõ]es).*$', '', 'gin');
  v := regexp_replace(v, '^.*obedi[êe]ncia cega.*$', '', 'gin');
  v := regexp_replace(v, '^\s*(o|a) (kpi|tool|ferramenta|consulta) (foi|j[áa] foi) (chamad|execut|realizad).*$', '', 'gin');
  v := regexp_replace(v, '^\s*(devo|vou) (responder|entregar|seguir|passar) (exatamente|s[óo]|apenas|somente).*$', '', 'gin');
  v := regexp_replace(v, E'\n{3,}', E'\n\n', 'g');
  v := btrim(v);
  if v <> '' then
    new.conteudo := v;
  end if;
  return new;
end;
$function$

