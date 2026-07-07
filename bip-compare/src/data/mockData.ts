import type { FileComparison, FileStatus, FileKind, StatDefinition } from '../types';

// Small deterministic pseudo-random generator so the mock dataset
// looks the same on every load (no Math.random flicker).
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260707);

const NAME_TEMPLATES: Array<{ prefix: string; kind: FileKind; ext: string; dir: string }> = [
  { prefix: 'zarzadzenie', kind: 'pdf', ext: 'pdf', dir: 'akty-prawne/zarzadzenia' },
  { prefix: 'uchwala-rady', kind: 'pdf', ext: 'pdf', dir: 'akty-prawne/uchwaly' },
  { prefix: 'protokol-sesji', kind: 'pdf', ext: 'pdf', dir: 'rada/protokoly' },
  { prefix: 'regulamin-organizacyjny', kind: 'doc', ext: 'docx', dir: 'organizacja' },
  { prefix: 'wniosek-o-dostep-do-inf', kind: 'doc', ext: 'docx', dir: 'formularze' },
  { prefix: 'budzet', kind: 'xls', ext: 'xlsx', dir: 'finanse/budzet' },
  { prefix: 'sprawozdanie-finansowe', kind: 'xls', ext: 'xlsx', dir: 'finanse/sprawozdania' },
  { prefix: 'plan-dzialania', kind: 'pdf', ext: 'pdf', dir: 'strategia' },
  { prefix: 'baner-bip', kind: 'image', ext: 'png', dir: 'assets' },
  { prefix: 'logo-urzedu', kind: 'image', ext: 'png', dir: 'assets' },
  { prefix: 'statut-jednostki', kind: 'pdf', ext: 'pdf', dir: 'organizacja' },
  { prefix: 'oferta-pracy', kind: 'doc', ext: 'docx', dir: 'kadry/nabor' },
  { prefix: 'rejestr-umow', kind: 'xls', ext: 'xlsx', dir: 'finanse/umowy' },
  { prefix: 'komunikat-prasowy', kind: 'pdf', ext: 'pdf', dir: 'aktualnosci' },
  { prefix: 'mapa-gminy', kind: 'image', ext: 'jpg', dir: 'assets' },
];

const STATUS_WEIGHTS: Array<[FileStatus, number]> = [
  ['ok', 0.7],
  ['different', 0.13],
  ['error404', 0.09],
  ['new', 0.05],
  ['removed', 0.03],
];

function pickStatus(): FileStatus {
  const r = rand();
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (r <= acc) return status;
  }
  return 'ok';
}

function pad(n: number, len = 4) {
  return String(n).padStart(len, '0');
}

function randomDate(startYear: number, endYear: number) {
  const year = startYear + Math.floor(rand() * (endYear - startYear + 1));
  const month = 1 + Math.floor(rand() * 12);
  const day = 1 + Math.floor(rand() * 28);
  const hh = Math.floor(rand() * 24);
  const mm = Math.floor(rand() * 60);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function typeForKind(kind: FileKind): string {
  switch (kind) {
    case 'pdf':
      return 'application/pdf';
    case 'doc':
      return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'xls':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'image':
      return 'image/png';
    default:
      return 'application/octet-stream';
  }
}

function buildFile(index: number): FileComparison {
  const template = NAME_TEMPLATES[Math.floor(rand() * NAME_TEMPLATES.length)];
  const status = pickStatus();
  const baseSize = Math.round(20 + rand() * 1500);
  const id = `file-${index}`;
  const name = `${template.prefix}-${pad(1 + Math.floor(rand() * 40), 2)}-${2022 + Math.floor(rand() * 4)}.${template.ext}`;
  const path = `/${template.dir}/${name}`;
  const type = typeForKind(template.kind);

  let oldSizeKb: number | null = baseSize;
  let newSizeKb: number | null = baseSize;
  let oldHttp: number | null = 200;
  let newHttp: number | null = 200;
  let oldDownloadOk = true;
  let newDownloadOk = true;
  let oldModified: string | null = randomDate(2022, 2023);
  let newModified: string | null = randomDate(2024, 2026);

  switch (status) {
    case 'different': {
      const delta = 1 + Math.floor(rand() * 400) * (rand() > 0.5 ? 1 : -1);
      newSizeKb = Math.max(1, baseSize + delta);
      break;
    }
    case 'error404': {
      newSizeKb = null;
      newHttp = 404;
      newDownloadOk = false;
      newModified = null;
      break;
    }
    case 'new': {
      oldSizeKb = null;
      oldHttp = null;
      oldDownloadOk = false;
      oldModified = null;
      break;
    }
    case 'removed': {
      newSizeKb = null;
      newHttp = 404;
      newDownloadOk = false;
      newModified = null;
      break;
    }
    default:
      break;
  }

  return {
    id,
    name,
    path,
    kind: template.kind,
    oldSizeKb,
    newSizeKb,
    oldHttp,
    newHttp,
    oldType: type,
    newType: type,
    oldModified,
    newModified,
    oldDownloadOk,
    newDownloadOk,
    status,
  };
}

export const TOTAL_FILES = 312;

export const files: FileComparison[] = Array.from({ length: TOTAL_FILES }, (_, i) => buildFile(i));

export const stats: StatDefinition[] = [
  {
    id: 'pages',
    label: 'Porównane strony',
    value: '1 248',
    helper: '100% z zaplanowanego',
    tone: 'blue',
    icon: 'files',
  },
  {
    id: 'diffs',
    label: 'Różnice',
    value: '86',
    helper: '6,9% z porównanych',
    tone: 'amber',
    icon: 'diff',
  },
  {
    id: 'ok',
    label: 'Pliki OK',
    value: '312',
    helper: '86,4% z plików',
    tone: 'green',
    icon: 'check',
  },
  {
    id: 'errors',
    label: 'Błędy pobierania',
    value: '18',
    helper: '5,0% z plików',
    tone: 'red',
    icon: 'alert',
  },
];

export const lastRunLabel = 'Dzisiaj, 10:24';
