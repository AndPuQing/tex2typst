import urllib.request
import html
from bs4 import BeautifulSoup


if __name__ == '__main__':
    shorthand_map = {}


    url = "https://typst.app/docs/reference/symbols/"
    with urllib.request.urlopen(url) as response:
        html_text = response.read().decode('utf-8')

    soup = BeautifulSoup(html_text, 'html.parser')

    # <ul class="symbol-grid">
    ul_list = soup.find_all('ul', class_='symbol-grid')
    # ul_shorthands_markup = ul_list[0]
    ul_shorthands_math = ul_list[1]

    li_list = ul_shorthands_math.find_all('li')
    for li in li_list:
        # e.g. <li id="symbol-arrow.r" data-math-shorthand="-&gt;"><button>...</button></li>
        # ==> typst = "arrow.r"
        # ==> shorthand = "->"
        typst = li['id'][7:]
        shorthand = html.unescape(li['data-math-shorthand'])
        print(f"['{typst}', '{shorthand}'],")
