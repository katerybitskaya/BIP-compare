# BIP Compare — Backend

API porównujące starą i nową wersję Biuletynu Informacji Publicznej (BIP).
Dla dwóch podanych adresów HTTPS:

1. sprawdza, czy obie strony w ogóle odpowiadają (reachability check),
2. przeszukuje (crawluje) każdą stronę i zbiera pełną listę jej podstron,
3. zapisuje wynik do plików JSON (patrz "Struktura wyników" poniżej),
4. wskazuje, które podstrony różnią się między wersjami:
   - **brakujące w nowej** — istniały na starym adresie, a pod tym samym
     adresem na nowej stronie zwracają błąd (np. 404),
   - **zbędne w nowej** — istnieją tylko na nowym adresie, nie miały
     odpowiednika na starym,
   - **niezmienione** — istnieją pod tym samym adresem po obu stronach,
5. dla każdej **niezmienionej** (dopasowanej) podstrony wykonuje dodatkowo
   szczegółowe porównanie:
   - **zawartości** — tekst widoczny na stronie (diff linia po linii) oraz
     "sygnatura struktury" (liczba nagłówków, akapitów, tabel, obrazków,
     list, linków) do wykrywania różnic w formatowaniu/prezentacji,
   - **linków** — które linki zniknęły, które są nowe, oraz czy każdy z nich
     w ogóle działa (status HTTP),
   - **załączników** — pliki (PDF/DOC/XLS/obrazki/itd.) podpięte pod stronę:
     które zniknęły, które są nowe, czy zmienił się rozmiar tego samego
     pliku, czy zmieniła się kolejność.

Zrzuty ekranu (porównanie wizualne) są celowo zarezerwowane, ale jeszcze
**nie zaimplementowane** — pole `screenshot_diff` istnieje już w modelu
danych każdej podstrony i zawsze jest `null`, dopóki nie dojdzie krok
renderowania stron (Playwright) w kolejnym etapie.

Każda "brakująca"/"zbędna" podstrona jest dodatkowo bezpośrednio sprawdzana
pod tym samym adresem na drugiej witrynie (nie tylko na podstawie tego, co
znalazł crawler), żeby uniknąć fałszywych trafień dla stron, które istnieją,
ale nie są nigdzie linkowane.

Strony są przeszukiwane "warstwami" (wszystkie linki z bieżącej głębokości
naraz, równolegle), więc nawet witryny z wieloma podstronami przeszukują się
szybko.

## Wymagania

- Python 3.10+

## Instalacja

```bash
cd bip-compare-backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Uruchomienie

```bash
uvicorn app.main:app --reload --port 8000
# lub, jeśli komenda "uvicorn" nie jest widoczna w PATH:
python -m uvicorn app.main:app --reload --port 8000
```

Serwer wystartuje pod `http://127.0.0.1:8000`. Dokumentacja API (Swagger) jest
dostępna pod `http://127.0.0.1:8000/docs`.

CORS jest już skonfigurowany pod frontend Vite (`http://localhost:5173`).

## Struktura wyników na dysku

Każde porównanie zapisuje swój własny folder pod `results/{id}/`:

```
results/{id}/
  summary.json          # lista podstron, missing/extra/unchanged, liczniki
  pages/
    {hash-ścieżki}.json # szczegółowy diff jednej dopasowanej podstrony
                         # (content_diff, links_diff, attachments_diff,
                         #  screenshot_diff — na razie zawsze null)
```

`summary.json` zostaje lekki (tak jak dotychczasowy pojedynczy plik wyniku) i
to on zasila listę raportów/kartek. Szczegóły per-podstrona są w osobnych
plikach, żeby ich nie trzeba było wczytywać, dopóki użytkownik faktycznie nie
wejdzie w konkretną podstronę w raporcie — przy stronie z tysiącami podstron
trzymanie wszystkiego w jednym pliku spowolniłoby każde otwarcie raportu.

Mapowanie "ścieżka podstrony -> nazwa pliku szczegółów" jest w polu
`page_details` w `summary.json`.

Szczegółowe porównanie jest generowane tylko dla pierwszych `500`
dopasowanych podstron na raport (`MAX_DETAILED_PAGES` w `app/comparison.py`)
— zabezpieczenie przed bardzo dużymi witrynami, gdzie sprawdzanie każdego
linku i załącznika na każdej stronie wielokrotnie zwiększyłoby liczbę
zapytań HTTP ponad to, co dał sam crawling.

## Endpointy

### `POST /api/compare`

Uruchamia porównanie dwóch stron.

Body:

```json
{
  "old_url": "https://bip.staryurzad.pl",
  "new_url": "https://bip.nowyurzad.pl",
  "timeout_seconds": 10
}
```

- `max_pages` *(opcjonalne)* — maksymalna liczba podstron do odwiedzenia na
  *jedną* stronę. Domyślnie (jeśli pominięte) przeszukiwana jest cała
  witryna, bez sztucznego limitu — wewnętrznie i tak obowiązuje
  zabezpieczenie na 5000 podstron na wypadek witryny generującej
  nieskończoną liczbę adresów (np. kalendarz z paginacją w nieskończoność).
- `timeout_seconds` — limit czasu pojedynczego żądania HTTP.

Odpowiedź (skrócona):

```json
{
  "id": "uuid",
  "generated_at": "...",
  "duration_ms": 1234.5,
  "old_url": "...",
  "new_url": "...",
  "both_reachable": true,
  "scope": { "content": true, "links": true, "attachments": true },
  "old_site": { "base_url": "...", "reachable": true, "root_status_code": 200, "pages": [...], "page_count": 42 },
  "new_site": { "base_url": "...", "reachable": true, "root_status_code": 200, "pages": [...], "page_count": 39 },
  "missing_in_new": [ { "path": "/kontakt", "reason": "HTTP 404", ... } ],
  "extra_in_new": [ { "path": "/nowa-podstrona", ... } ],
  "unchanged_paths": ["/", "/o-nas", "..."],
  "page_details": { "/o-nas": "a1b2c3d4e5f6a7b8", "...": "..." },
  "pages_with_content_changes": 3,
  "pages_with_link_issues": 1,
  "pages_with_attachment_issues": 0,
  "file_diffs": [
    {
      "key": "/dokumenty/regulamin.pdf",
      "filename": "regulamin.pdf",
      "old": { "filename": "regulamin.pdf", "href": "...", "status_code": 200, "ok": true, "size_bytes": 20480, "content_type": "application/pdf", "source_path": "/o-nas" },
      "new": { "filename": "regulamin.pdf", "href": "...", "status_code": 200, "ok": true, "size_bytes": 20992, "content_type": "application/pdf", "source_path": "/o-nas" },
      "status": "different"
    }
  ]
}
```

`scope` (w treści zapytania) kontroluje, które szczegółowe sprawdzenia się wykonują:
- `content` — diff treści + struktury HTML dla dopasowanych podstron,
- `links` — diff linków (brakujące/dodatkowe/niedziałające) dla dopasowanych podstron,
- `attachments` — diff załączników per-podstrona ORAZ `file_diffs` (patrz niżej); wyłączenie pomija oba.

Domyślnie wszystkie trzy są włączone. Zrzuty ekranu nie mają jeszcze odpowiadającej flagi — funkcja jeszcze nie istnieje.

`file_diffs` to **osobne, ogólnosite porównanie plików** — wszystkich załączników (PDF/DOC/XLS/obrazki/itd.) znalezionych GDZIEKOLWIEK na obu witrynach, dopasowanych po znormalizowanej ścieżce, niezależnie od tego, z której konkretnie podstrony pochodzą. To zasila płaską listę plików na Dashboardzie (`status`: `ok` | `different` | `error404` | `new` | `removed`). To coś innego niż `attachments_diff` w szczegółach pojedynczej podstrony (`/pages`), który pokazuje różnice w załącznikach tylko *tej jednej* podstrony.

Wynik jest też zapisywany na dysku pod `results/{id}/` (patrz wyżej).

### `GET /api/compare/{id}`

Zwraca wcześniej zapisany, pełny raport porównania (jak wyżej — czyli
zawartość `summary.json`).

### `GET /api/compare/{id}/pages?path=/o-nas`

Zwraca szczegółowy diff jednej konkretnej podstrony: `content_diff`
(zmiany tekstu + sygnatura struktury), `links_diff` (brakujące/dodatkowe/
niedziałające linki), `attachments_diff` (brakujące/dodatkowe/zmiana
rozmiaru/kolejności załączników), `screenshot_diff` (na razie zawsze `null`).
404, jeśli dla podanej ścieżki nie wygenerowano szczegółów (np. przekroczono
`MAX_DETAILED_PAGES`, albo strona nie jest w `unchanged_paths`).

### `GET /api/compare`

Zwraca listę skróconych podsumowań wszystkich zapisanych raportów (adresy,
data, dostępność, liczby brakujących/zbędnych/niezmienionych podstron oraz
liczniki podstron z różnicami w treści/linkach/załącznikach) — używane przez
frontendową listę kartek w zakładce „Raporty”.

### `GET /api/health`

Prosty health-check (`{"status": "ok"}`).

## Ograniczenia crawlera

- Crawler chodzi tylko po linkach `<a href>` w obrębie tej samej domeny (nie
  wychodzi na zewnętrzne strony) przy budowaniu listy podstron do
  odwiedzenia. Przy szczegółowym porównaniu linków (`links_diff`) brane są
  pod uwagę wszystkie linki na stronie, również zewnętrzne.
- Pliki (PDF, DOCX, XLSX, obrazki, itd.) nie są traktowane jako podstrony —
  są zbierane osobno jako "załączniki" i porównywane w ramach
  `attachments_diff` każdej podstrony (nazwa, rozmiar, kolejność).
- Adresy są normalizowane bez query stringa i fragmentu (`#...`) — dwie różne
  strony z tym samym `path`, ale innym `?query`, są traktowane jako ta sama
  podstrona.
- Liczba jednoczesnych połączeń HTTP jest ograniczona (`httpx.Limits`), żeby
  bardzo duże witryny nie otwierały setek połączeń naraz.
- Zrzuty ekranu (porównanie wizualne) — zarezerwowane na przyszłość, jeszcze
  niezaimplementowane.
