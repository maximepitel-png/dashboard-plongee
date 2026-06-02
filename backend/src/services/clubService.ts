import axios from 'axios';
import * as cheerio from 'cheerio';
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 3600 }); // 1 hour cache

export interface ClubDive {
  id: string;
  date: string;
  location: string;
  site: string;
  organizer: string;
  maxParticipants: number | null;
  currentParticipants: number | null;
  level: string;
  notes: string;
  registrationUrl: string | null;
}

const CLUB_URL = 'https://caen-ouistreham-plongee.org/mep/wp_sorties_new.htm';

// French month names to numbers
const MONTHS: Record<string, number> = {
  janvier: 1, février: 2, mars: 3, avril: 4, mai: 5, juin: 6,
  juillet: 7, août: 8, septembre: 9, octobre: 10, novembre: 11, décembre: 12,
  jan: 1, fév: 2, mar: 3, avr: 4, jun: 6, juil: 7, aoû: 8, sep: 9, oct: 10, nov: 11, déc: 12,
};

function parseFrenchDate(dateStr: string): string {
  try {
    const cleaned = dateStr.toLowerCase().trim();
    // Try pattern: "samedi 14 juin 2025" or "14/06/2025" or "14-06-2025"
    const numeric = cleaned.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/);
    if (numeric) {
      const day = parseInt(numeric[1]);
      const month = parseInt(numeric[2]);
      let year = parseInt(numeric[3]);
      if (year < 100) year += 2000;
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    const textMatch = cleaned.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
    if (textMatch) {
      const day = parseInt(textMatch[1]);
      const monthName = textMatch[2];
      const year = parseInt(textMatch[3]);
      const month = MONTHS[monthName];
      if (month) {
        return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }

    return dateStr;
  } catch {
    return dateStr;
  }
}

export async function fetchClubDives(): Promise<{ dives: ClubDive[]; lastUpdated: string; error?: string }> {
  const cacheKey = 'club_dives';
  const cached = cache.get<{ dives: ClubDive[]; lastUpdated: string }>(cacheKey);
  if (cached) return cached;

  try {
    const response = await axios.get(CLUB_URL, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; DashboardPlongee/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
        'Accept-Language': 'fr-FR,fr;q=0.9',
      },
    });

    const $ = cheerio.load(response.data);
    const dives: ClubDive[] = [];

    // Try to find table rows with dive info
    // The site likely has a table structure
    $('table tr').each((idx, row) => {
      if (idx === 0) return; // skip header

      const cells = $(row).find('td');
      if (cells.length < 3) return;

      const cellTexts = cells.toArray().map((c) => $(c).text().trim());

      // Try to identify date in first few cells
      const dateCell = cellTexts.find((t) => /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/.test(t) || /\d{1,2}\s+\w+\s+\d{4}/i.test(t));
      if (!dateCell) return;

      const parsedDate = parseFrenchDate(dateCell);
      // Skip past dives
      if (parsedDate < new Date().toISOString().split('T')[0]) return;

      const dive: ClubDive = {
        id: `dive_${idx}_${parsedDate}`,
        date: parsedDate,
        location: cellTexts[1] || '',
        site: cellTexts[2] || '',
        organizer: cellTexts[3] || '',
        maxParticipants: null,
        currentParticipants: null,
        level: cellTexts[4] || '',
        notes: cellTexts[5] || '',
        registrationUrl: null,
      };

      // Try to extract participant counts like "8/12"
      for (const text of cellTexts) {
        const partMatch = text.match(/(\d+)\s*\/\s*(\d+)/);
        if (partMatch) {
          dive.currentParticipants = parseInt(partMatch[1]);
          dive.maxParticipants = parseInt(partMatch[2]);
          break;
        }
        const maxMatch = text.match(/max\s*:?\s*(\d+)/i);
        if (maxMatch) {
          dive.maxParticipants = parseInt(maxMatch[1]);
        }
      }

      // Try to extract registration link
      $(row).find('a').each((_, a) => {
        const href = $(a).attr('href');
        if (href) dive.registrationUrl = href;
      });

      if (dive.location || dive.site) {
        dives.push(dive);
      }
    });

    // If no table-based results, try div-based layout
    if (dives.length === 0) {
      $('[class*="sortie"], [class*="dive"], [class*="plongee"], [class*="planning"]').each((idx, el) => {
        const text = $(el).text().trim();
        if (!text) return;

        const dateMatch = text.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+\w+\s+\d{4})/i);
        if (!dateMatch) return;

        const parsedDate = parseFrenchDate(dateMatch[1]);
        if (parsedDate < new Date().toISOString().split('T')[0]) return;

        dives.push({
          id: `dive_div_${idx}`,
          date: parsedDate,
          location: 'Normandie',
          site: text.substring(0, 100),
          organizer: '',
          maxParticipants: null,
          currentParticipants: null,
          level: '',
          notes: text,
          registrationUrl: $(el).find('a').first().attr('href') || null,
        });
      });
    }

    // Sort by date
    dives.sort((a, b) => a.date.localeCompare(b.date));

    const result = {
      dives: dives.slice(0, 20), // limit to 20
      lastUpdated: new Date().toISOString(),
    };

    cache.set(cacheKey, result);
    return result;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : 'Erreur inconnue';
    console.error('Club scraping error:', errorMsg);

    // Return mock data as fallback so the widget shows something
    const fallback = {
      dives: getMockDives(),
      lastUpdated: new Date().toISOString(),
      error: `Impossible de récupérer les sorties: ${errorMsg}`,
    };
    return fallback;
  }
}

function getMockDives(): ClubDive[] {
  const today = new Date();
  const dives: ClubDive[] = [];

  const sites = ['Épave du SS Storaa', 'Les Roches de Grandcamp', 'Plateau du Calvados', 'Baie de Seine'];
  const locations = ['Ouistreham', 'Grandcamp-Maisy', 'Port-en-Bessin', 'Courseulles-sur-Mer'];
  const organizers = ['Jean-Pierre D.', 'Marie L.', 'François B.', 'Sophie M.'];

  for (let i = 0; i < 4; i++) {
    const date = new Date(today.getTime() + (7 + i * 7) * 86400000);
    dives.push({
      id: `mock_${i}`,
      date: date.toISOString().split('T')[0],
      location: locations[i],
      site: sites[i],
      organizer: organizers[i],
      maxParticipants: 12,
      currentParticipants: Math.floor(Math.random() * 8) + 2,
      level: i % 2 === 0 ? 'Niveau 2 minimum' : 'Tous niveaux',
      notes: i === 0 ? 'Sortie bi-bouteille recommandée' : '',
      registrationUrl: null,
    });
  }

  return dives;
}

export function clearClubCache(): void {
  cache.del('club_dives');
}
