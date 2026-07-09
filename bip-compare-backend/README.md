# BIP Compare — Backend

Backend FastAPI dla narzędzia BIP Compare.

## Wymagania

- Python 3.11+
- pip

## Instalacja i uruchomienie

```bash
cd bip-compare-backend

# Zainstaluj zależności
pip install -r requirements.txt

# Uruchom serwer (domyślnie http://127.0.0.1:8000)
uvicorn app.main:app --reload
```

## Endpointy

| Metoda | Ścieżka | Opis |
|--------|---------|------|
| `POST` | `/api/compare` | Uruchom nowe porównanie |
| `GET` | `/api/compare` | Lista wszystkich raportów |
| `DELETE` | `/api/compare` | Usuń wszystkie raporty |
| `GET` | `/api/compare/{id}` | Pełny raport |
| `GET` | `/api/compare/{id}/raw/{old\|new}` | Surowe dane crawla |
| `GET` | `/api/compare/{id}/content-diff?path=...` | Diff treści dla jednej podstrony |

## Dokumentacja API

Po uruchomieniu serwera dostępna pod: http://127.0.0.1:8000/docs

## Konfiguracja

| Zmienna środowiskowa | Domyślnie | Opis |
|----------------------|-----------|------|
| `VITE_API_BASE_URL` | `http://127.0.0.1:8000` | Adres backendu (ustawiany po stronie frontendu) |

## Architektura

```
app/
├── __init__.py      # Package marker
├── main.py          # FastAPI app + endpointy
├── models.py        # Modele Pydantic (lustrzane odbicie TypeScript types.ts)
├── crawler.py       # Crawler BFS stron BIP
└── comparator.py    # Logika porównania: strony / linki / pliki / treść
results/             # Zapisane raporty JSON (tworzone automatycznie)
```



# Backend (port 8000)
cd bip-compare-backend
python -m uvicorn app.main:app --reload

# Frontend (port 5173/5174)
cd bip-compare
npm run dev
