# BIP Compare — Backend

API porównujące starą i nową wersję Biuletynu Informacji Publicznej (BIP).
Dla dwóch podanych adresów HTTPS:

1. sprawdza, czy obie strony w ogóle odpowiadają (reachability check),
2. przeszukuje (crawluje) każdą stronę i zbiera pełną listę jej podstron,
3. zapisuje wynik do pliku JSON,
4. wskazuje, które podstrony różnią się między wersjami:
   - **brakujące w nowej** — istniały na starym adresie, a pod tym samym
     adresem na nowej stronie zwracają błąd (np. 404),
   - **zbędne w nowej** — istnieją tylko na nowym adresie, nie miały
     odpowiednika na starym,
   - **niezmienione** — działają identycznie po obu stronach.

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
  "old_site": { "base_url": "...", "reachable": true, "root_status_code": 200, "pages": [...], "page_count": 42 },
  "new_site": { "base_url": "...", "reachable": true, "root_status_code": 200, "pages": [...], "page_count": 39 },
  "missing_in_new": [ { "path": "/kontakt", "reason": "HTTP 404", ... } ],
  "extra_in_new": [ { "path": "/nowa-podstrona", ... } ],
  "unchanged_paths": ["/", "/o-nas", "..."]
}
```

Wynik jest też zapisywany na dysku w `results/{id}.json`.

### `GET /api/compare/{id}`

Zwraca wcześniej zapisany, pełny raport porównania (jak wyżej).

### `GET /api/compare`

Zwraca listę skróconych podsumowań wszystkich zapisanych raportów (adresy,
data, dostępność, liczby brakujących/zbędnych/niezmienionych podstron) —
używane przez frontendową listę kartek w zakładce „Raporty”.

### `GET /api/health`

Prosty health-check (`{"status": "ok"}`).

## Ograniczenia crawlera

- Crawler chodzi tylko po linkach `<a href>` w obrębie tej samej domeny (nie
  wychodzi na zewnętrzne strony).
- Pomija pliki (PDF, DOCX, XLSX, obrazki, itd.) — skupia się na podstronach
  HTML. Porównywanie plików (rozmiar, dostępność) to osobna funkcjonalność
  widoczna już we frontendowym dashboardzie (dane przykładowe) i można ją
  dołączyć do backendu w kolejnym kroku, jeśli będzie potrzebna.
- Adresy są normalizowane bez query stringa i fragmentu (`#...`) — dwie różne
  strony z tym samym `path`, ale innym `?query`, są traktowane jako ta sama
  podstrona.
- Liczba jednoczesnych połączeń HTTP jest ograniczona (`httpx.Limits`), żeby
  bardzo duże witryny nie otwierały setek połączeń naraz.
