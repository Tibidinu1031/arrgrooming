# Arr Grooming Salon — site de prezentare

Site static, responsive, în limba română, pentru **Arr Grooming Salon**, salon de grooming pentru câini și pisici din Galați. `index.html` din rădăcina proiectului este pagina principală. Tot ce trebuie pentru rulare este inclus local: CSS, JavaScript, fonturi și imagini. Nu e nevoie de framework, instalări, backend sau build.

## Publicare pe GitHub Pages

1. Urcă proiectul în repository: `index.html`, `styles.css`, `fonts.css`, `app.js`, tot folderul `assets/` și `.nojekyll`, direct în rădăcină.
2. Deschide **Settings, apoi Pages** în repository.
3. Alege **Deploy from a branch**, selectează branch-ul (de obicei `main`) și folderul **`/ (root)`**, apoi salvează.
4. Deschide adresa afișată de GitHub după publicare.

Toate căile sunt relative, deci merge atât pe `utilizator.github.io`, cât și pe `utilizator.github.io/repository/`.

Site-ul este publicat la https://tibidinu1031.github.io/arrgrooming/. Dacă se mută pe un domeniu propriu, actualizează în `index.html` adresele din `og:url`, `og:image` și `canonical`, ca imaginea să apară corect când linkul e distribuit pe Facebook sau WhatsApp.

## Previzualizare locală

Cu Node.js instalat: `npm run dev`, apoi deschide http://127.0.0.1:4173. `npm run check` verifică sintaxa JavaScript, iar `npm run build` copiază opțional site-ul în `dist/` pentru alte servicii de hosting.

## Calendarul de programări

Secțiunea **Programări** are un calendar complet, fără backend:

1. clientul alege câine sau pisică (și talia, pentru câini);
2. alege serviciul, cu durata estimată;
3. alege ziua din calendar (duminica e închis, zilele trecute sunt blocate, se poate programa cu până la 60 de zile înainte) și ora, generată din programul salonului și durata serviciului;
4. completează numele, telefonul și numele animalului.

La final se deschide o fereastră din care cererea se trimite gata completată pe **WhatsApp** sau prin **SMS** la 0744 134 819, ori clientul sună direct. Poate și descărca un eveniment `.ics` pentru calendarul lui. Programarea se confirmă telefonic de salon; site-ul nu salvează date.

Totul se configurează la începutul fișierului `app.js`:

- `SALON.hours` — programul pe zile (acum L–V 09:00–18:00, S 09:00–14:00, D închis);
- `SALON.slotStep`, `SALON.leadMinutes`, `SALON.horizonDays` — pasul dintre ore, cât de repede se poate programa cineva în ziua curentă și câte zile în avans;
- `SERVICES` — serviciile, pentru ce animale sunt și duratele estimative pe talii;
- `SALON.bookingEndpoint` — opțional, un URL (Formspree, Google Apps Script etc.) care primește cererea ca JSON. Dacă e completat, cererea ajunge și automat la salon.

## Conținut și surse

Datele salonului provin din profilul Google al salonului, pagina de Facebook și contul de TikTok (@arrgrooming.salon): adresa (Str. 1 Decembrie 1918 nr. 1, Bl. S5C, parter, lângă Salonul Ciufulix), telefonul, programul, nota 5,0 și recenzia citată. Cromatica (roz, indigo, bleu și galben) este preluată de pe vitrina salonului.

Câinele din hero (`assets/hero-dog.webp`, decupat de pe fundal) este o fotografie de Karsten Winegeart de pe Unsplash, folosită sub licența Unsplash (gratuită și pentru uz comercial, fără atribuire obligatorie): https://unsplash.com/photos/JGkGlJlgR1Y. Când salonul are poze proprii de calitate, pot înlocui fișierul.

De confirmat cu clientul înainte de lansare:

- lista de servicii și duratele estimative (prețurile nu sunt afișate, se comunică la telefon);
- programul: Google indică L–V 09:00–18:00 și S 09:00–14:00, iar Notino indică deschidere luni de la 10:00;
- dacă salonul folosește WhatsApp pe numărul 0744 134 819;
- numele groomerului (Notino listează echipa: Daniel).

## Design și comportament

- Logo nou vectorial (`assets/logo-mark.svg`): jumătate cățel, jumătate pisică, cu mașină de tuns, pe insigna roz a salonului. Același desen e folosit ca favicon și iconiță pentru telefon.
- Hero-ul ocupă exact înălțimea ecranului pe orice dispozitiv, inclusiv telefoane în modul landscape, cu efecte decorative: linii, puncte, inele, bule de spumă, traseu punctat cu mașină de tuns, insignă rotativă și o pisică ce iese din colț.
- Interacțiuni în fiecare secțiune: bandă cu servicii în mișcare, contoare animate, acordeoane animate, pași care se aprind la scroll, calendar, carduri TikTok cu efect 3D, stele animate, status „deschis acum” calculat după ora României, copiere număr de telefon, hartă ilustrată.
- Link TikTok în bara de sus, în hero, în meniul de pe telefon, în secțiunea TikTok, la contact și în subsol.
- Fără emoji: toate pictogramele sunt SVG inline, deci arată la fel pe orice telefon sau tabletă.
- Respectă setarea „reduce motion” și funcționează cu tastatura (inclusiv calendarul, cu săgeți, Home/End și PageUp/PageDown).
