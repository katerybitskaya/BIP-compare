# Strony testowe BIP Compare

`site1/` (stara wersja) i `site2/` (nowa wersja) to dwie minimalne strony
BIP, skonstruowane tak, żeby jedno porównanie wywołało każdy możliwy status
w każdej kategorii (Podstrony, Zawartość, Linki, Pliki, Zrzuty ekranów).

## Uruchomienie

```bash
python serve-test-sites.py
```

Serwuje `site1/` pod `http://127.0.0.1:9001`, `site2/` pod
`http://127.0.0.1:9002`, oraz `external/` pod `http://127.0.0.1:9003` (cel
linków testowych w `/aktualnosci` — nie porównuj tego adresu bezpośrednio,
to nie jest wersja BIP). Zostaw uruchomione w tle, uruchom backend
(`uvicorn app.main:app --reload --port 8000`) i frontend, i porównaj:

- stary adres: `http://127.0.0.1:9001`
- nowy adres: `http://127.0.0.1:9002`

Zaznacz wszystkie kategorie zakresu (Zawartość, Linki, Pliki, Zrzuty
ekranów), żeby zobaczyć wszystko naraz.

## Oczekiwane wyniki

### Podstrony

| Podstrona | Oczekiwany status |
|---|---|
| `/` | bez zmian |
| `/o-nas` | bez zmian (jako podstrona — treść różni się, patrz „Zawartość”) |
| `/aktualnosci` | bez zmian (jako podstrona) |
| `/dokumenty` | bez zmian (jako podstrona) |
| `/galeria` | bez zmian (jako podstrona) |
| `/kontakt` | brakująca w nowej (istnieje tylko na `site1`) |
| `/nowa-oferta` | zbędna w nowej (istnieje tylko na `site2`) |

### Zawartość

| Podstrona | Oczekiwany status |
|---|---|
| `/` | identyczna |
| `/o-nas` | zmieniona (inny tekst) |
| `/aktualnosci` | zmieniona (inna lista linków) |
| `/dokumenty` | zmieniona (inna lista plików) |
| `/galeria` | zmieniona (inny baner) |

### Linki (z `/aktualnosci`)

| Link | Oczekiwany status |
|---|---|
| `127.0.0.1:9003/` | ok |
| `127.0.0.1:9003/nieistniejacy-zasob-testowy` | uszkodzony |
| `127.0.0.1:9003/usunieta-podstrona` | usunięty (tylko w starej wersji) |
| `127.0.0.1:9003/nowa-podstrona` | nowy (tylko w nowej wersji) |

### Pliki (z `/dokumenty`)

| Plik | Oczekiwany status |
|---|---|
| `regulamin.pdf` | ok (identyczny rozmiar) |
| `uchwala.pdf` | różny (inny rozmiar) |
| `stary-formularz.pdf` | error404 (link istnieje po obu stronach, plik usunięty z `site2`) |
| `wycofany-dokument.pdf` | usunięty (link istnieje tylko w `site1`) |
| `nowy-zalacznik.pdf` | nowy (link istnieje tylko w `site2`) |

### Zrzuty ekranów

| Podstrona | Oczekiwany status |
|---|---|
| `/` | identyczne |
| `/galeria` | różne (baner niebieski → zielony) |
| pozostałe wspólne podstrony | różnią się nieznacznie (inny tekst) |
| `/kontakt`, `/nowa-oferta` | brak porównania (istnieją tylko po jednej stronie) |

Wszystko, łącznie z linkami, działa w 100% lokalnie — bez dostępu do internetu.
