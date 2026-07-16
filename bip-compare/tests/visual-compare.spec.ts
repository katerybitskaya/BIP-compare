import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

// Zmienne konfigurujące porównanie
const SOURCE_URL = 'http://localhost:8001';
const MIGRATED_URL = 'http://localhost:8002';

const pagesToCompare = [
  { path: '/', name: 'strona-glowna' },
  { path: '/contact.html', name: 'kontakt' },
  { path: '/zamowienia.html', name: 'zamowienia' }
];

test.describe('Porównanie wizualne stron BIP', () => {
  for (const { path: pagePath, name } of pagesToCompare) {
    test(`Porównanie dla: ${name}`, async ({ page }, testInfo) => {
      // 1. Zrzut ekranu oryginalnej strony (źródłowej)
      const urlSource = `${SOURCE_URL}${pagePath}`;
      await page.goto(urlSource, { waitUntil: 'networkidle' });
      
      // Zapisujemy zrzut ekranu ze strony źródłowej jako obraz referencyjny (baseline) 
      // dla mechanizmu toMatchSnapshot.
      const snapshotName = `${name}.png`;
      const expectedSnapshotPath = testInfo.snapshotPath(snapshotName);
      
      const sourceScreenshot = await page.screenshot({ fullPage: true });
      fs.mkdirSync(path.dirname(expectedSnapshotPath), { recursive: true });
      fs.writeFileSync(expectedSnapshotPath, sourceScreenshot);

      // 2. Zrzut ekranu strony zmigrowanej i bezpośrednie porównanie
      const urlMigrated = `${MIGRATED_URL}${pagePath}`;
      await page.goto(urlMigrated, { waitUntil: 'networkidle' });

      // Wykonujemy zrzut strony zmigrowanej i porównujemy z przed chwilą zapisanym wzorcem
      // maxDiffPixelRatio określa tolerancję na błędy (ustawiamy np. na 0.1, by wyłapać istotne różnice).
      // Playwright automatycznie wygeneruje różnice (-diff.png) w raporcie HTML, 
      // jeśli strony nie będą się zgadzać.
      expect(await page.screenshot({ fullPage: true })).toMatchSnapshot(snapshotName, {
        maxDiffPixelRatio: 0.05
      });
    });
  }
});
