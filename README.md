# Budget Planer

Eine moderne Web-Anwendung zur Budgetplanung mit monatlicher Übersicht, Steuerberechnung und Gehaltsabzügen.

## Schnellstart

### Voraussetzungen

- Python 3.10 oder höher
- [uv](https://github.com/astral-sh/uv) - Python Paket-Manager
- [bun](https://bun.sh) - JavaScript Runtime

### Installation und Start

1. **Repository klonen oder herunterladen**

2. **Start-Script ausführbar machen:**
   ```bash
   chmod +x start.sh
   ```

3. **Server starten:**
   ```bash
   ./start.sh
   ```

Das Script installiert automatisch alle benötigten Abhängigkeiten und startet Backend und Frontend.

4. **Anwendung öffnen:**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000

5. **Server stoppen:**
   Drücken Sie `Ctrl+C` im Terminal

## Erste Schritte

1. **Neues Budget erstellen**
   - Klicken Sie auf "Neues Budget erstellen"
   - Geben Sie einen Namen und Jahr ein

2. **Kategorien hinzufügen**
   - Klicken Sie auf "+ Kategorie hinzufügen"
   - Wählen Sie den Typ: Einnahmen, Fixkosten, Variable Kosten oder Sparen

3. **Beträge eingeben**
   - Klicken Sie auf eine Zelle im Monatsgitter
   - Geben Sie geplante und tatsächliche Beträge ein

4. **Eingabemodi**
   - **Monatlich**: Jeden Monat einzeln eingeben
   - **Jährlich**: Jahresbetrag wird auf 12 Monate verteilt
   - **Benutzerdefiniert (X Monate)**: Betrag wird X-mal im Jahr verteilt (z.B. 4x pro Jahr)

## Features

- ✅ Monatliche und jährliche Budgetübersicht
- ✅ Gehaltsabzüge (Brutto → Netto Berechnung)
- ✅ Steuerberechnung basierend auf Bruttogehalt
- ✅ Kategorien als Vorlage speichern
- ✅ Drag & Drop zum Neuanordnen von Kategorien
- ✅ Verschiedene Berechnungsmodi für Gesamteinnahmen
- ✅ Dark Mode Unterstützung

## Hilfe

Bei Problemen oder Fragen erstellen Sie bitte ein Issue im GitHub Repository.
