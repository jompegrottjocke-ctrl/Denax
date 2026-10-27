# Denax 0.2

En enkel studio för trance och techno på Windows 11. Bygg mönster med trummor, bas och synthmelodi och arrangera dem till en låt. All ljudbehandling sker lokalt.

## Kom igång

Node.js 22 eller 24 och npm krävs.

```sh
npm ci
npm run dev
```

Utvecklingsservern använder port 5173. `npm start` öppnar Electron-appen på en dator med grafiskt skrivbord. På molnmaskinen kan beroenden uppdateras med `XDG_CACHE_HOME=/tmp/denax-cache ELECTRON_GET_USE_PROXY=1 npm ci --cache /tmp/denax-npm-cache`.

## Skapa en låt

1. Välj **Mönster A–D**. Varje mönster är en takt med 16 kvantiserade steg. Ändra trumsteg eller tryck **Slumpa trummor**. **Duplicera** skapar en oberoende kopia, upp till åtta mönster. Namnge dem om du vill.
2. Öppna **Piano roll** och välj lead eller bas. Klicka för att lägga till en ton, klicka igen för paus. Högerklick tar bort tonstarten i det steget. Välj tonlängd 1/16, 1/8 eller 1/4 innan du placerar tonen. Varje instrument har högst en tonstart per steg; ljudsvansar kan överlappa. Oktavväljaren byter synligt tonregister.
3. Välj **Låt** för arrangemanget eller **Mönsterloop** för det mönster du redigerar. Klicka i tidslinjen för att placera valt mönster på ett spår; klicka på samma klipp igen eller högerklicka för att radera. Varje spår kan använda ett eget mönster i varje takt. Klicka på ett taktnummer för startposition.
4. Välj 4–128 takter. **Trance-struktur** ersätter tidslinjen med en enkel intro/build/breakdown/drop-mall. **Töm tidslinjen** raderar klippen. Båda kan ångras. När du kortar låten tas de bortklippta takterna bort; Ångra återställer dem.
5. Använd mixerns **M** för mute och **S** för solo. Flera kanaler kan solo-lyssnas tillsammans. Mute har företräde framför solo. Lead-filter och temposynkat delay justerar synthens klang. Master styr hela mixen.
6. **Exportera låt** renderar tidslinjen en gång. I mönsterläge exporteras fyra upprepade takter. WAV-filen är 16-bitars stereo, 48 kHz, exakt vald längd; ljudsvansar klipps vid slutet. Syntetiska brusbaserade trummor varierar lite mellan uppspelningar och exporter.

De fyra förberedda mönstren och 32-taktersarrangemanget är en startpunkt. För längre trancearrangemang, välj exempelvis 128 takter och fyll tidslinjen.

## Ljudbank och projekt

Importera one-shots via ljudbanken till vänster eller släpp en fil på en trumkanal. Provlyssna från banken och välj kanal med **Lägg**. Ett ljud per kanal används globalt över alla mönster. Bassamplingar transponeras från antagen grundton A1. Lead är en inbyggd synth med tre detunade oscillatorer, filter och delay.

- Högst 8 sekunder, mono/stereo och 40 MB per fil. Banken rymmer 32 ljud och 96 MB. Tilldelade ljud får tillsammans vara högst 96 MB.
- WAV/MP3/OGG/FLAC fungerar om Chromium kan avkoda formatet. Fel visas utan att ersätta ett fungerande projekt.
- **Spara projekt** sparar arrangemang, samtliga mönster, mixer och tilldelade ljud i JSON. Otilldelade ljud i banken sparas inte. Ingen automatisk sparning finns.
- Äldre Denax 0.1-projekt kan öppnas och blir ett fyrataktersarrangemang med ett mönster.
- Ångra/gör om omfattar mönster, toner, arrangemang och mixer. Ljudimport och ljudbyten ingår inte i historiken. Projektöppning startar en ny historik.
- Mellanslag spelar/pausar (utanför inmatningsfält och knappar), Ctrl+S sparar, Ctrl+Z ångrar och Ctrl+Shift+Z gör om.

## Windows 11

Kör på Windows med Node.js:

```powershell
npm ci
npm run dist:win
npm run dist:portable
```

Installationsprogram respektive portabel `.exe` skapas i `dist/`. Ingen kodsignering är konfigurerad. Windows kan visa en varning för ett osignerat program. Installationsförlopp och ljudenhet måste verifieras på Windows 11 före release.

GitHub Actions-flödet **Windows installer** testar och bygger båda paketen på Windows när koden ligger på `main` eller när flödet startas manuellt. Det laddar upp paketen som artifacts, inte som en publik release.

## Tester

```sh
npm test
npx playwright install chromium
npm run test:ui
```

Enhetstester verifierar rytmer, klippstyrd uppspelning, mixerregler, låtlängd, validering och migrering. Gränssnittstester verifierar arrangemangsredigering, piano roll, paus/fortsätt, slut på låten, projektrundtur med ljud och WAV-export inklusive tyst mix. En befintlig Chromium kan väljas med `DENAX_CHROMIUM_PATH=/usr/bin/chromium npm run test:ui` på Linux.

Denax har ännu inte ljudinspelning, MIDI-inmatning, VST, automation, polyfonisk ackordredigering eller långa ljudklipp på tidslinjen. Tidslinjen arrangerar mönster och one-shots.
