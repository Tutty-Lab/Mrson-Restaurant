# Dienstplan & Stundenzettel — Mrson Restaurant

Web-App zur **automatischen Erstellung monatlicher Dienstpläne** und **druckbarer
deutscher Stundenzettel** für ein Restaurant / Geschäft in Deutschland.

- Kein eigener Server, kein Solver, kein KI-Modell.
- Deterministischer, heuristischer Greedy-Algorithmus.
- Der Plan trifft **jedes monatliche Soll exakt** und lässt sich anschließend
  manuell bearbeiten.
- Persistenz: **LocalStorage** als Offline-Puffer, zusätzlich **Supabase**
  (`store_data`), sofern `VITE_SUPABASE_URL` und `VITE_SUPABASE_ANON_KEY`
  gesetzt sind. Alle Filialen teilen sich eine Tabelle und werden nur über
  `STORE_ID` getrennt (siehe `src/lib/supabase.ts`) – diese Kennung MUSS je
  Repo eindeutig sein.
- Einfache Passwortsperre im Client (`src/lib/auth.ts`), keine echte
  Zugriffskontrolle.

## Tech-Stack

React · TypeScript · Vite · Tailwind CSS · date-fns · Browser-Druck (PDF) ·
LocalStorage · Vitest.

## Installation & Start

```bash
npm install
npm run dev
```

Die App läuft danach unter der von Vite angezeigten URL (Standard
`http://localhost:5173`).

## Weitere Befehle

```bash
npm run test     # Unit-Tests (Vitest)
npm run build    # Produktions-Build (tsc + vite build)
npm run preview  # Produktions-Build lokal ansehen
```

## Bedienung

1. **Einstellungen** – Firmenname, Anschrift, Monat, Jahr; **Arbeitszeit-Fenster
   je Wochentag + Feiertag** (giờ làm; Standard: täglich 11:30–22:00, **Montag
   geschlossen**). **Feiertage (Nordrhein-Westfalen)** werden automatisch erkannt
   und angezeigt. Unter **„Ngày đặc biệt"** lassen sich einzelne Tage
   überschreiben (geschlossen oder abweichende Zeiten, z.B. halber Tag).
2. **Mitarbeiter** – Vollzeit/Teilzeit und monatliche Sollstunden pflegen
   (Feld „Giờ định mức"); daneben steht, in wie viele Dienste sich das Soll
   zerlegen lässt.
3. **Dienstplan** – **„Dienstplan erstellen"** generiert den Monatsplan.
   Zellen sind anklickbar: Zeiten/Pause ändern, als *Frei* markieren,
   Schicht verschieben, hinzufügen, löschen. **„Auf Original zurücksetzen"**
   stellt den zuletzt generierten Plan wieder her. **CSV-Export** verfügbar.
4. **Stundenzettel** – druckbarer A4-Zettel je Mitarbeiter,
   einzeln oder alle (über den Druckdialog als PDF speichern).

## Geschäftsregeln (Kurzfassung)

Maßgeblich ist immer der Code; die Doku-Tabellen in der App (Tab **Tài liệu**)
werden direkt aus den Konstanten gerendert und können daher nicht veralten.

- **Der Laden ist nie offen und unbesetzt.** Geprüft wird jede Minute der
  Öffnungszeit, nicht nur Auf- und Zusperren (`uncoveredMinutes`,
  `dayDefect`). Vorher genügten zwei kurze Dienste an den beiden Enden, und in
  der Mitte stand der Laden leer.
- **Wie viele freie Tage möglich sind, entscheidet das Monats-Soll.** Bei
  höchstens 9 bezahlten Stunden je Tag braucht 120 h 14 Arbeitstage, 173 h 20
  und 195 h 22. Bei 25 offenen Tagen (Ruhetag Montag) bleiben einer 195-h-Kraft
  damit höchstens drei freie Tage im Monat – ein fester freier Wochentag kostet
  vier bis fünf und geht nicht auf. Das ist Arithmetik, kein Fehler des
  Verfahrens.
- **Höchstens 7 Beschäftigte** (Angabe des Betriebs). Verstoß = Warnung, kein
  Riegel.
- **Minijob: höchstens 10 Stunden je WOCHE** (`MINIJOB_MAX_WEEKLY_HOURS`).
  Bewusst je Woche geprüft und nicht über den Monat gemittelt – sonst ginge
  eine 20-Stunden-Woche durch, solange eine andere leer bleibt. Arbeitet
  jemand zwei Tage in der Woche, werden daraus zwei Dienste; die Wochenstunden
  verteilen sich auf die offenen Tage, statt in einem langen Dienst aufzugehen.
- **Feste Arbeitstage je Person** (`availableWeekdays`, Tab *Nhân viên*).
  Leer = jeder Tag. Ein Feld für beide Richtungen: nur Fr+So ankreuzen für eine
  Kraft, die nur an diesen Tagen kommt, oder Montag abwählen für jemanden mit
  festem freien Tag.
- **Urlaub** (`vacationDates`): der Nutzer trägt die Tage ein, der Automat
  wählt sie NIE selbst – wer wann frei nimmt, ist eine Absprache im Betrieb.
  Eingetragene Tage werden beim Planen ausgespart. Ausgewählt wird über eine
  Liste der Monatstage zum Ankreuzen (`VacationPicker`), mit dem Wochentag in
  derselben Zeile; geschlossene Tage sind gesperrt. Vorher stand dort ein
  `<input type="date">`, bei dem jeder einzelne Tag neu im Browser-Kalender
  gesucht werden musste. Beim Klick auf „Dienstplan
  erstellen" fragt die App noch einmal ab, wer im Monat Urlaub hat.
  Gerechnet wird in **Arbeitstagen** (§ 3 BUrlG: wer eine Stunde kommt, hat
  einen ganzen Arbeitstag verbraucht), Anspruch 24 Tage für Stammkräfte und 8
  für Minijob, geprüft über das ganze **Jahr**. Mehr ist erlaubt – es gibt eine
  Warnung, keinen Riegel.
- Max. **9 bezahlte Stunden** pro Tag, **ein Dienst** pro Mitarbeiter und Tag.
- Höchstens **6 aufeinanderfolgende** Arbeitstage.
- **Pause** (`calculatePause`), Vorgabe des Betriebs „nach spätestens 4 Stunden
  muss die Kraft eine Pause nehmen": bis 4 h = 0 Min, über 4 h = 30 Min, ab 9 h
  = 45 Min (ArbZG-Minimum). Strenger als das Gesetz, das erst ab über 6 h eine
  Pause verlangt. Die Pause zählt **nicht** zum Soll, verlängert aber die
  Anwesenheit: `presence = paid + pause`. Eine 9-h-Schicht belegt damit 9,75 h
  und passt in das Fenster 11:30–22:00 (10,5 h).
- Schichtlängen: **3 bis 9 Stunden**. Vollzeit bekommt 4..9 h, Teilzeit 3..9 h.
  Etwa jede zehnte Schicht wird bewusst auf 4–5 h gekürzt
  (`SHORT_SHIFT_CHANCE`), damit die Pläne nicht mechanisch aussehen – aber nur,
  wenn der Tag keinen langen Dienst mehr für die Stoßzeit braucht.
- **Stoßzeiten** (`PEAK_WINDOWS`): 18:00–21:00 sollen
  durchgehend mit **mindestens 2 Personen** besetzt sein – geprüft wird die
  kleinste Besetzung über die ganze Spanne, nicht ein einzelner Zeitpunkt.
  Reicht die Belegschaft dafür nicht, bleibt der Plan gültig; das Dashboard
  weist die betroffenen Tage als Warnung aus (`analyzeSchedule.peakViolations`).
- Nachfrage-Gewichte pro Wochentag (`DAY_WEIGHTS`) → mehr Stunden am
  **Wochenende** (Fr/Sa/So), Montag ist geschlossen. **Feiertage zählen wie
  Sonntag** (Nachfrage + Zeitfenster).
- **Arbeitszeit-Fenster je Tag** (giờ làm): Früh am Fenster-Beginn, Spät am
  Fenster-Ende. Geschlossene Tage bekommen keine Schicht; an verkürzten Tagen
  werden nur passende (kurze) Schichten geplant. Reicht das nicht, um beide
  Stoßzeiten zu decken, ordnet `layoutDayForPeaks` die Dienste innerhalb des
  Fensters neu an – Dauer und Pause bleiben dabei unverändert.
- **Sollstunden pflegt der Betrieb selbst** (Tab *Nhân viên*, Feld
  „Giờ định mức"). Ein Soll unter der kürzesten Schicht (3 h) ist nicht
  planbar und wird mit einer eigenen Meldung abgelehnt.

## Projektstruktur

```
src/
  types.ts                 zentrale Typen (intern immer Minuten als Integer)
  lib/
    time.ts                timeToMinutes, minutesToTime, calculatePause, ...
    shifts.ts              Schicht-Vorlagen (Früh/Spät)
    demand.ts              Tagesgewichte, Spätschicht-Quoten, Kalender
    splitTargetHours.ts    Zerlegung des Solls in Schichtlängen (DP)
    consecutive.ts         Ketten aufeinanderfolgender Tage, seeded RNG
    workHours.ts           Arbeitszeit-Fenster je Tag + Ausnahmen (Overrides)
    holidays.ts            Nordrhein-Westfalen-Feiertage (Osterformel/Computus)
    scheduler.ts           Greedy-Scheduler, Reparaturlauf, Stoßzeiten-Layout
    validation.ts          Prüfung aller Regeln
    analyze.ts             Auswertung: Stoßzeiten, Gewichtstreue, Abweichung
    storage.ts             LocalStorage
    supabase.ts            Client + STORE_ID dieser Filiale
    remote.ts              Laden/Speichern in store_data
    auth.ts                Passwortsperre (nur clientseitig)
    company.ts             Firmenname und Anschrift (fest)
    pdf.ts                 Druck/PDF des Stundenzettels
    sampleData.ts          Beispielbelegschaft (August 2026) – nur für Tests
    seedData.ts            drei Monate mit wechselnden Belegschaften (Tests)
    shiftOps.ts            manuelles Bearbeiten von Schichten
    dateFormat.ts          deutsche Monatsnamen / Formatierung
    __tests__/             Unit-Tests
  hooks/useSchedule.ts     zentrales State-Management + Persistenz
  components/              UI (Einstellungen, Mitarbeiter, Dienstplan, Stundenzettel)
```

## Tests

Getestet werden u. a. `timeToMinutes`, `minutesToTime`, `calculatePause`,
`calculatePaidMinutes`, `splitTargetHours`, die Berechnung aufeinanderfolgender
Tage und die Monats-Validierung.

`seedMonths.test.ts` fährt den Scheduler gegen **drei Monate mit
unterschiedlichen Belegschaften** und prüft: jedes Einzelsoll exakt, höchstens
6 Tage am Stück, Schichtlängen 3..9 h mit passender Pause, keine Schicht
außerhalb des Fensters – und beide Stoßzeiten durchgehend doppelt besetzt.
Diese letzte Prüfung gibt es doppelt: einmal über `minCoverageOver`, einmal als
stumpfe Gegenprobe, die **jede Minute einzeln nachzählt**. Wäre die Abtastung
falsch, meldete die Auswertung sonst fälschlich „alles grün".

`guards.test.ts` deckt die zwei Fälle ab, die der Betrieb durch eigene Eingaben
auslöst: ein Soll unter 3 h (eigene Fehlermeldung statt Kapazitäts-Vortrag) und
eine zu dünne Belegschaft (Plan bleibt korrekt, Lücken werden gemeldet).

Der Report in `seedMonths.test.ts` schreibt zusätzlich Schichtlängen-Verteilung,
Gewichtstreue je Wochentag und die Abweichung vom Tages-Soll auf die Konsole.

## Hinweise / Grenzen (MVP)

- Sollstunden aktuell in **ganzen Stunden**, mindestens 3 h.
- `Schedule` hält immer **genau einen Monat**. Es gibt kein Archiv über
  mehrere Monate; ein Monatswechsel ersetzt den Stand.
- Schicht-Vorlagen sind exakt vorgegeben für 10:00–22:00 und nur für
  pausenfreie Längen; sonst werden Früh-/Spät-Zeiten generisch abgeleitet.
- Der Plan ist „operativ plausibel", nicht mathematisch optimal. Die mittlere
  Abweichung vom rechnerischen Tages-Soll liegt in den Testmonaten bei 1–2 %.
