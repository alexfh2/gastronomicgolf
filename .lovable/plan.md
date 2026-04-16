

# Ajustar jerarquia de categories i salts de linia en la generacio de contingut

## Resum

Actualitzar les tres edge functions (`generate-news`, `generate-whatsapp`, `generate-instagram`) per:

1. **Handicap Baix i Alt**: mostrar els 3 primers (prioritat principal)
2. **Femeni i Senior**: mostrar nomes el 1r classificat
3. **Salts de linia**: instruccions explicites al prompt perque l'IA generi text ben estructurat amb separacio clara entre seccions

## Canvis

### 1. `generate-news/index.ts`
- Reduir dades Femenina/Senior de top 10 a nomes 1r classificat al prompt
- Actualitzar instruccions: "Per a Hcp Baix i Hcp Alt, inclou els 3 primers. Per a Femenina i Senior, nomes el guanyador/a"
- Afegir instruccio de format: separar cada categoria amb una linia en blanc

### 2. `generate-whatsapp/index.ts`
- Reduir dades Femenina/Senior a nomes 1r classificat
- Actualitzar el text de referencia per reflectir: top 3 per HCP, nomes guanyador/a per Femeni/Senior
- Afegir instruccio explicita: "IMPORTANT: Deixa una linia en blanc entre cada secció/categoria per facilitar la lectura"

### 3. `generate-instagram/index.ts`
- Mateixos canvis: top 3 per HCP, nomes 1r per Femeni/Senior
- Instruccio de salts de linia clars entre blocs

### Detall tecnic
- Canviar `females.slice(0, 3)` / `females.slice(0, 10)` a `females.slice(0, 1)` als 3 fitxers
- Canviar `seniors.slice(0, 3)` / `seniors.slice(0, 10)` a `seniors.slice(0, 1)` als 3 fitxers
- Mantenir `hcpLow.slice(0, 3)` i `hcpHigh.slice(0, 3)` (ja correcte a WA/IG, canviar de 10 a 3 a news per coherencia amb el que es demana)
- Afegir instruccions de format amb salts de linia a cada prompt

