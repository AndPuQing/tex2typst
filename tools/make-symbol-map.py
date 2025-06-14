import urllib.request
from bs4 import BeautifulSoup

if __name__ == '__main__':
    symbol_map = {}

    url = "https://typst.app/docs/reference/symbols/sym/"
    with urllib.request.urlopen(url) as response:
        html_text = response.read().decode('utf-8')

    soup = BeautifulSoup(html_text, 'html.parser')
    # <ul class="symbol-grid">
    ul = soup.find('ul', class_='symbol-grid')
    li_list = ul.find_all('li')
    for li in li_list:
        # e.g. <li id="symbol-brace.r.double" data-latex-name="\rBrace" data-codepoint="10628"><button>...</button></li>
        # ==> latex = rBrace
        # ==> typst = brace.r.double
        # ==> unicode = 10628 = \u2984
        latex = li.get('data-latex-name', None)
        typst = li['id'][7:]
        unicode = int(li['data-codepoint'])
        if latex is not None:
            # some latex macro can be associated with multiple typst
            # e.g. \equiv can be mapped to equal or equiv.triple
            # We only keep the first one
            if latex not in symbol_map:
                symbol_map[latex] = typst

    # sort the pairs with alphabetical order of latex
    sorted_keys = sorted(list(symbol_map.keys()), key=str.lower)
    sorted_symbol_map = [(key, symbol_map[key]) for key in sorted_keys]
    for latex, typst in sorted_symbol_map:
        print(f"    ['{latex[1:]}', '{typst}'],")
        # print(f'{latex[1:]} = "{typst}"')
