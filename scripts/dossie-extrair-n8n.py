"""Extrai do workflow n8n 'Dossie OC (SeniorX) v6.4' (backup JSON) o subconjunto que gera o dossie
(Entrada OC -> Gerar HTML do Dossie) para dentro do APPCNS:
  src/lib/dossie/nos/*.js   um arquivo por no Code, codigo VERBATIM dentro de uma funcao
  src/lib/dossie/nos/index.js
  src/lib/dossie/fluxo.json nos nao-Code (http/merge/splitOut/switch) + conexoes
Credenciais fixas do workflow sao trocadas por marcadores; nada secreto vai para o repositorio."""
import json, os, re, sys, unicodedata

ORIGEM = sys.argv[1]
DESTINO = sys.argv[2]
wf = json.load(open(ORIGEM, encoding="utf8"))
por_nome = {n["name"]: n for n in wf["nodes"]}
con = wf["connections"]
ENTRADA, SAIDA = "Entrada OC", "Gerar HTML do Dossiê"

# alcancaveis a partir da entrada, parando na saida
alcance, fila = set(), [ENTRADA]
while fila:
    n = fila.pop()
    if n in alcance:
        continue
    alcance.add(n)
    if n == SAIDA:
        continue
    for ramo in con.get(n, {}).get("main", []):
        for t in ramo:
            fila.append(t["node"])


def slug(nome):
    s = unicodedata.normalize("NFKD", nome).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")


os.makedirs(os.path.join(DESTINO, "nos"), exist_ok=True)
for f in os.listdir(os.path.join(DESTINO, "nos")):
    os.remove(os.path.join(DESTINO, "nos", f))

fluxo = {"entrada": ENTRADA, "saida": SAIDA, "nos": {}, "conexoes": []}
indice = []
for nome in sorted(alcance, key=lambda x: [n["name"] for n in wf["nodes"]].index(x)):
    n = por_nome[nome]
    tipo = n["type"].split(".")[-1]
    p = n["parameters"]
    if nome == ENTRADA:
        continue  # a entrada e' fornecida pelo chamador
    if tipo == "code":
        arq = slug(nome) + ".js"
        corpo = p["jsCode"].rstrip() + "\n"
        # `items` e' o global legado do n8n; so vira parametro quando o no o usa sem declarar o proprio.
        usa_items = bool(re.search(r"\bitems\b", corpo)) and not re.search(r"\b(const|let|var)\s+items\b", corpo)
        open(os.path.join(DESTINO, "nos", arq), "w", encoding="utf8", newline="\n").write(
            "// @ts-nocheck\n"
            f"// No Code do workflow n8n \"{nome}\" (Dossie OC SeniorX v6.4), codigo original sem alteracoes.\n"
            "// Globais do n8n: $input, $ (como $('Outro no')), $json e items (= $input.all()).\n"
            "export default async function ($input, $, $json" + (", items" if usa_items else "") + ") {\n" + corpo + "}\n"
        )
        indice.append((nome, arq))
        fluxo["nos"][nome] = {"tipo": "code"}
    elif tipo == "httpRequest":
        corpo = p.get("body", "")
        corpo = re.sub(r"<user>.*?</user>", "<user>__SENIOR_USER__</user>", corpo, flags=re.S)
        corpo = re.sub(r"<password>.*?</password>", "<password>__SENIOR_PASSWORD__</password>", corpo, flags=re.S)
        assert re.findall(r"<password>(.*?)</password>", corpo) in ([], ["__SENIOR_PASSWORD__"]), nome  # nenhuma senha real no fluxo
        assert re.findall(r"<user>(.*?)</user>", corpo) in ([], ["__SENIOR_USER__"]), nome
        fluxo["nos"][nome] = {"tipo": "http", "body": corpo}
    elif tipo == "merge":
        modo = p.get("mode", "append")
        fluxo["nos"][nome] = {"tipo": "merge", "modo": "combineByPosition" if (modo == "combine" and p.get("combineBy") == "combineByPosition") else "append"}
    elif tipo == "splitOut":
        fluxo["nos"][nome] = {"tipo": "splitOut", "campo": p["fieldToSplitOut"]}
    elif tipo == "switch":
        regras = []
        for r in p["rules"]["values"]:
            c = r["conditions"]["conditions"][0]
            regras.append({"expr": c["leftValue"].replace("={{", "").replace("}}", "").strip(), "igual": c["rightValue"]})
        fluxo["nos"][nome] = {"tipo": "switch", "regras": regras, "fallback": True}
    else:
        raise SystemExit(f"tipo nao tratado: {nome} {tipo}")

# no extra (fora do trecho do fluxo): empacota o resultado para o registro do dossie; rodado a parte pelo gerador
for nome in ("Montar Envio do Dossiê",):
    corpo = por_nome[nome]["parameters"]["jsCode"].rstrip() + chr(10)
    arq = slug(nome) + ".js"
    cab = "// @ts-nocheck" + chr(10) + "// No Code do workflow n8n \"" + nome + "\" (Dossie OC SeniorX v6.4), codigo original sem alteracoes." + chr(10)
    open(os.path.join(DESTINO, "nos", arq), "w", encoding="utf8", newline=chr(10)).write(cab + "export default async function ($input, $, $json) {" + chr(10) + corpo + "}" + chr(10))
    indice.append((nome, arq))

for de in alcance:
    if de == SAIDA:
        continue
    for i, ramo in enumerate(con.get(de, {}).get("main", [])):
        for t in ramo:
            if t["node"] in alcance:
                fluxo["conexoes"].append({"de": de, "saida": i, "para": t["node"], "entrada": t["index"]})

# configuracoes de no do n8n que mudam o comportamento (sempre emitir dado / seguir com erro como saida)
for nome, def_ in fluxo["nos"].items():
    n = por_nome[nome]
    if n.get("alwaysOutputData"):
        def_["sempreEmitir"] = True
    if n.get("onError") == "continueRegularOutput":
        def_["seguirComErro"] = True

json.dump(fluxo, open(os.path.join(DESTINO, "fluxo.json"), "w", encoding="utf8", newline="\n"), ensure_ascii=False, indent=1)

# index.js: nome do no -> funcao
linhas = ["// Gerado por scripts/dossie-extrair-n8n (ver docs/dossie-no-appcns.md). Nome do no n8n -> funcao.", "// @ts-nocheck"]
for i, (nome, arq) in enumerate(indice):
    linhas.append(f'import n{i} from "./{arq[:-3]}";')
linhas.append("export const NOS = {")
for i, (nome, arq) in enumerate(indice):
    linhas.append(f"  {json.dumps(nome, ensure_ascii=False)}: n{i},")
linhas.append("};")
open(os.path.join(DESTINO, "nos", "index.js"), "w", encoding="utf8", newline="\n").write("\n".join(linhas) + "\n")
print("nos code:", len(indice), "| outros:", len(fluxo["nos"]) - len(indice), "| conexoes:", len(fluxo["conexoes"]))
