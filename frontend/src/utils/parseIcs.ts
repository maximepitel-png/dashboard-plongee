export interface IcsEvent {
  uid: string;
  summary: string;
  description?: string;
  location?: string;
  dtstart: Date;
  dtend?: Date;
}

function parseIcsDate(val: string): Date {
  const digits = val.replace(/\D/g, '');
  const y = digits.slice(0, 4), mo = digits.slice(4, 6), d = digits.slice(6, 8);
  const h = digits.slice(9, 11) || '00', mi = digits.slice(11, 13) || '00', s = digits.slice(13, 15) || '00';
  if (val.includes('T')) {
    return new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}`);
  }
  return new Date(`${y}-${mo}-${d}`);
}

export function parseIcs(raw: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  const lines = raw.replace(/\r\n /g, '').replace(/\r\n\t/g, '').split(/\r?\n/);

  let current: Partial<IcsEvent> | null = null;

  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') {
      current = {};
    } else if (line === 'END:VEVENT' && current) {
      if (current.summary && current.dtstart) {
        events.push({
          uid: current.uid ?? Math.random().toString(36),
          summary: current.summary,
          description: current.description,
          location: current.location,
          dtstart: current.dtstart,
          dtend: current.dtend,
        } as IcsEvent);
      }
      current = null;
    } else if (current) {
      const colonIdx = line.indexOf(':');
      if (colonIdx === -1) continue;
      const key = line.slice(0, colonIdx).split(';')[0].toUpperCase();
      const value = line.slice(colonIdx + 1).trim();

      switch (key) {
        case 'UID': current.uid = value; break;
        case 'SUMMARY': current.summary = value; break;
        case 'DESCRIPTION': current.description = value.replace(/\\n/g, '\n').replace(/\\,/g, ','); break;
        case 'LOCATION': current.location = value; break;
        case 'DTSTART': current.dtstart = parseIcsDate(value); break;
        case 'DTEND': current.dtend = parseIcsDate(value); break;
      }
    }
  }

  return events.sort((a, b) => a.dtstart.getTime() - b.dtstart.getTime());
}
