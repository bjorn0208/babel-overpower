import sys, time
sys.path.insert(0, "/opt/babel")
import deepgram, fish, ia_ligadora as motor
dg_key = motor.chave_api("deepgram")
fish_key = motor.chave_api("fish_audio")
# gera uma fala pt-BR conhecida com a voz da Bel, em 8kHz (como no telefone)
frase = "Oi, meu nome é Teus e eu tenho uma pizzaria em Santos."
pcm = fish.wav_para_slin8k(fish.tts(fish_key, frase))
print(f"fala de teste ({len(pcm)//16}ms): {frase!r}\n")
s = deepgram.SessaoDeepgram(dg_key, endpointing_ms=700)
# alimenta em quadros de 20ms no ritmo real (como o AudioSocket)
for i in range(0, len(pcm), 320):
    s.alimentar(pcm[i:i+320]); time.sleep(0.02)
# manda silêncio pra disparar o endpoint
for _ in range(60):
    s.alimentar(b"\x00"*320); time.sleep(0.02)
t = s.proximo_turno(timeout=4)
print(f"DEEPGRAM streaming entendeu: {t!r}")
s.fechar()
