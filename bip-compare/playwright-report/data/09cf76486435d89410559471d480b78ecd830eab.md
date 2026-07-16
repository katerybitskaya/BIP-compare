# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: visual-compare.spec.ts >> Porównanie wizualne stron BIP >> Porównanie dla: strona-glowna
- Location: tests\visual-compare.spec.ts:17:5

# Error details

```
Error: expect(Buffer).toMatchSnapshot(expected) failed

  348117 pixels (ratio 0.38 of all image pixels) are different.

  Snapshot: strona-glowna.png

```

# Page snapshot

```yaml
- generic [active] [ref=e1]:
  - banner [ref=e2]:
    - heading "Biuletyn Informacji Publicznej" [level=1] [ref=e3]
    - heading "Urząd Gminy Przykładowo" [level=2] [ref=e4]
  - navigation [ref=e5]:
    - list [ref=e6]:
      - listitem [ref=e7]:
        - link "Strona główna" [ref=e8] [cursor=pointer]:
          - /url: index.html
      - listitem [ref=e9]:
        - link "Dane kontaktowe" [ref=e10] [cursor=pointer]:
          - /url: contact.html
      - listitem [ref=e11]:
        - link "Przetargi" [ref=e12] [cursor=pointer]:
          - /url: zamowienia.html
  - main [ref=e13]:
    - heading "Strona Główna BIP" [level=3] [ref=e14]
    - paragraph [ref=e15]: Witamy w oficjalnym Biuletynie Informacji Publicznej Gminy Przykładowo. Zapraszamy do zapoznania się z udostępnionymi materiałami.
```

# Test source

```ts
  1  | import { test, expect } from '@playwright/test';
  2  | import * as fs from 'fs';
  3  | import * as path from 'path';
  4  | 
  5  | // Zmienne konfigurujące porównanie
  6  | const SOURCE_URL = 'http://localhost:8001';
  7  | const MIGRATED_URL = 'http://localhost:8002';
  8  | 
  9  | const pagesToCompare = [
  10 |   { path: '/', name: 'strona-glowna' },
  11 |   { path: '/contact.html', name: 'kontakt' },
  12 |   { path: '/zamowienia.html', name: 'zamowienia' }
  13 | ];
  14 | 
  15 | test.describe('Porównanie wizualne stron BIP', () => {
  16 |   for (const { path: pagePath, name } of pagesToCompare) {
  17 |     test(`Porównanie dla: ${name}`, async ({ page }, testInfo) => {
  18 |       // 1. Zrzut ekranu oryginalnej strony (źródłowej)
  19 |       const urlSource = `${SOURCE_URL}${pagePath}`;
  20 |       await page.goto(urlSource, { waitUntil: 'networkidle' });
  21 |       
  22 |       // Zapisujemy zrzut ekranu ze strony źródłowej jako obraz referencyjny (baseline) 
  23 |       // dla mechanizmu toMatchSnapshot.
  24 |       const snapshotName = `${name}.png`;
  25 |       const expectedSnapshotPath = testInfo.snapshotPath(snapshotName);
  26 |       
  27 |       const sourceScreenshot = await page.screenshot({ fullPage: true });
  28 |       fs.mkdirSync(path.dirname(expectedSnapshotPath), { recursive: true });
  29 |       fs.writeFileSync(expectedSnapshotPath, sourceScreenshot);
  30 | 
  31 |       // 2. Zrzut ekranu strony zmigrowanej i bezpośrednie porównanie
  32 |       const urlMigrated = `${MIGRATED_URL}${pagePath}`;
  33 |       await page.goto(urlMigrated, { waitUntil: 'networkidle' });
  34 | 
  35 |       // Wykonujemy zrzut strony zmigrowanej i porównujemy z przed chwilą zapisanym wzorcem
  36 |       // maxDiffPixelRatio określa tolerancję na błędy (ustawiamy np. na 0.1, by wyłapać istotne różnice).
  37 |       // Playwright automatycznie wygeneruje różnice (-diff.png) w raporcie HTML, 
  38 |       // jeśli strony nie będą się zgadzać.
> 39 |       expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(snapshotName, {
     |                                                         ^ Error: expect(Buffer).toMatchSnapshot(expected) failed
  40 |         maxDiffPixelRatio: 0.05
  41 |       });
  42 |     });
  43 |   }
  44 | });
  45 | 
```