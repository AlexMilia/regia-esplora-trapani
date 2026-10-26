# Sicurezza

Questa repo è **pubblica**. Chiunque legge quello che c'è dentro, oggi e nella cronologia dei commit.
Un file rimosso con un commit successivo resta leggibile per sempre nella storia: l'unico rimedio vero,
una volta che una chiave è finita qui, è **ruotare la chiave**, non cancellare il file.

## Non entra mai in repo

- La **service_role key** di Supabase.
- Il **token della regia** (quello che autorizza le scritture su `poi_api.php`).
- La chiave **Anthropic** usata dagli endpoint AI.
- Le credenziali **Backblaze B2** (keyID e applicationKey).
- Credenziali FTP, database, hosting.

Tutte queste vivono in **un solo posto**: `poi_api.php` sul server, che è escluso dal `.gitignore`.
Se serve versionare la forma del file, si versiona un `poi_api.esempio.php` con i valori sostituiti da
segnaposto.

## Cosa può stare in chiaro

- L'URL del progetto Supabase e la **chiave anon**: sono già pubblici per forza di cose, stanno nel
  JavaScript di ogni pagina del sito. Non sono un segreto, sono un identificativo.
- Quello che le protegge non è la segretezza ma le **policy RLS**: con la chiave anon si deve poter
  solo *leggere*, e solo le righe destinate al pubblico. Ogni tabella nuova nasce con RLS attiva e una
  policy di sola lettura.

## Regole operative

1. **Una chiave transitata in una chat, in uno screenshot o in un file condiviso è compromessa.**
   Si ruota, senza discutere se "forse non l'ha vista nessuno".
2. `poi_api.php` accetta scritture **solo sulle tabelle nella whitelist `$TABELLE`**. Una tabella nuova
   va aggiunta lì esplicitamente, non per comodità su tutte.
3. Il token della regia va confrontato con `hash_equals()`, non con `==`.
4. Prima di ogni consegna: cerca nel file le stringhe che somigliano a una chiave
   (`eyJhbGciOi`, `sk-ant`, `service_role`) e assicurati che non ci siano.
5. Le pagine pubbliche non devono mai contenere endpoint di scrittura né il token.

## Controllo prima di committare

```bash
grep -rniE "service_role|eyJhbGciOi|sk-ant|applicationKey|ftp://" .
```

Se trova qualcosa che non sia un esempio con segnaposto, non si committa.
