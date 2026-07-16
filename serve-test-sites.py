"""Serves the two example BIP fixture sites (site1/ = stara wersja, site2/ =
nowa wersja) plus a third "external/" site used only as a link-diff target,
over plain HTTP, so BIP Compare can crawl them like any real website. Needed
because the crawler/Playwright require real http:// URLs -- they can't read
files straight off disk (file://).

Uruchomienie:
    python serve-test-sites.py

Zatrzymanie: Ctrl+C.

Adresy do wklejenia w formularzu porównania:
    stary adres: http://127.0.0.1:9001
    nowy adres:  http://127.0.0.1:9002

(external/ na porcie 9003 nie jest samodzielną wersją BIP do porównania --
to tylko cel linków z site1/site2, dzięki czemu status „ok”/„uszkodzony”/
„nowy”/„usunięty” w porównaniu linków działa w 100% lokalnie, bez zależności
od prawdziwego internetu.)

Zobacz TEST-SITES.md -- opis, która podstrona/plik/link demonstruje który
status porównania.
"""
from __future__ import annotations

import functools
import http.server
import os
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent

SITES = {
    "site1": 9001,
    "site2": 9002,
    "external": 9003,
}


class PrettyUrlHandler(http.server.SimpleHTTPRequestHandler):
    """Resolves clean URLs like /o-nas to o-nas.html on disk.

    The site1/site2 fixtures deliberately use extensionless BIP-style paths
    (/o-nas, /kontakt, ...) even though the files on disk are named
    o-nas.html, kontakt.html, etc. Plain http.server.SimpleHTTPRequestHandler
    only maps "/" to index.html -- it has no idea /o-nas should mean
    o-nas.html, so every subpage 404s and the crawler only ever discovers
    the homepage. This override tries the exact path first (so real files,
    e.g. /pliki/regulamin.pdf, are unaffected), then falls back to path +
    ".html" if that exact file doesn't exist.
    """

    def translate_path(self, path: str) -> str:
        translated = super().translate_path(path)
        if os.path.isdir(translated) or os.path.isfile(translated):
            return translated
        with_html = translated + ".html"
        if os.path.isfile(with_html):
            return with_html
        return translated


def _serve(directory: Path, port: int) -> None:
    handler = functools.partial(PrettyUrlHandler, directory=str(directory))
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), handler)
    print(f"  http://127.0.0.1:{port}  ->  {directory.name}/")
    server.serve_forever()


def main() -> None:
    print("Serwuję strony testowe BIP Compare:\n")
    threads = []
    for name, port in SITES.items():
        directory = ROOT / name
        if not directory.is_dir():
            print(f"UWAGA: brak folderu {directory} -- pomijam.")
            continue
        t = threading.Thread(target=_serve, args=(directory, port), daemon=True)
        t.start()
        threads.append(t)

    if not threads:
        print("Nie znaleziono żadnego folderu site1/site2 obok tego skryptu.")
        return

    print("\nNaciśnij Ctrl+C, aby zatrzymać.")
    try:
        for t in threads:
            t.join()
    except KeyboardInterrupt:
        print("\nZatrzymano.")


if __name__ == "__main__":
    main()
