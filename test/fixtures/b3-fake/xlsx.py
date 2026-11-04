"""Escreve e lê .xlsx para o gerador de extratos falsos da B3 (test/fixtures/b3-fake/gerar.mjs).

O repositório não tem biblioteca de planilha no node_modules; o Node chama este script com python3 -I.

  python3 -I xlsx.py escrever <pedido.json>   pedido: {"data": "AAAA-MM-DD", "arquivos": [{"caminho", "aba", "linhas"}]}
  python3 -I xlsx.py ler <arquivo.xlsx>       imprime a primeira planilha como JSON (lista de linhas, vazio = null)

Para a mesma entrada sair o mesmo arquivo byte a byte, as datas internas do .xlsx (propriedades e entradas do zip)
ficam fixas na data final do gerador.
"""
import datetime
import io
import json
import re
import sys
import zipfile

import openpyxl


def escrever(pedido_caminho):
    with open(pedido_caminho, encoding="utf-8") as f:
        pedido = json.load(f)
    a, m, d = (int(x) for x in pedido["data"].split("-"))
    quando = datetime.datetime(a, m, d, 12, 0, 0)
    for arq in pedido["arquivos"]:
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.title = arq["aba"]
        for linha in arq["linhas"]:
            ws.append(linha)
        wb.properties.creator = "b3-fake"
        wb.properties.created = quando
        wb.properties.modified = quando
        buf = io.BytesIO()
        wb.save(buf)
        # Regrava o zip com data fixa em cada entrada; o openpyxl põe a hora do save em dcterms:modified
        entrada = zipfile.ZipFile(io.BytesIO(buf.getvalue()))
        fixa = quando.strftime("%Y-%m-%dT%H:%M:%SZ")
        with zipfile.ZipFile(arq["caminho"], "w", zipfile.ZIP_DEFLATED) as saida:
            for info in entrada.infolist():
                dados = entrada.read(info.filename)
                if info.filename == "docProps/core.xml":
                    dados = re.sub(rb"(<dcterms:(?:created|modified)[^>]*>)[^<]*(<)", lambda x: x.group(1) + fixa.encode() + x.group(2), dados)
                novo = zipfile.ZipInfo(info.filename, date_time=(a, m, d, 12, 0, 0))
                novo.compress_type = zipfile.ZIP_DEFLATED
                novo.external_attr = 0o600 << 16
                saida.writestr(novo, dados)


def ler(caminho):
    wb = openpyxl.load_workbook(caminho, read_only=True, data_only=True)
    ws = wb[wb.sheetnames[0]]
    linhas = []
    for linha in ws.iter_rows(values_only=True):
        linhas.append([v if v is None or isinstance(v, (int, float, str)) else str(v) for v in linha])
    json.dump({"aba": wb.sheetnames[0], "linhas": linhas}, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    if len(sys.argv) != 3 or sys.argv[1] not in ("escrever", "ler"):
        sys.exit("uso: xlsx.py escrever <pedido.json> | ler <arquivo.xlsx>")
    (escrever if sys.argv[1] == "escrever" else ler)(sys.argv[2])
