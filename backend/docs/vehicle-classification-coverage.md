# Vehicle classification coverage

Repository baseline, evaluated 2026-09-07. Live administrator definitions can change these totals.

Total selectable models: 628

Classified: 304

Unclassified: 324

The Other custom-entry actions are excluded. Mappings preserve existing explicit AutoSPF+ pricing rules; old keyword heuristics are excluded. No new automotive/body-style inference was used. Classifications cover optional model years through 2026 and remain subject to the existing review deadline.

## Classified by canonical tier

- SEDAN: 27
- HATCHBACK_SMALL_CAR: 30
- HIGH_END_SEDAN: 65
- SUV: 105
- LARGE_SUV_VAN: 37
- PICKUP: 21
- MIDSIZED: 19

## Unclassified models requiring business review

- **Acura**: ILX, Integra, TLX, RLX, NSX, RDX, MDX, ZDX
- **Alfa Romeo**: Stelvio, Tonale, 4C, 8C
- **Aston Martin**: DBS, Rapide, Vanquish
- **Audi**: A1, A3, A5, A7, e-tron, Q4 e-tron, RS3, RS5
- **BAIC**: M20, M50S, X55, BJ20, BJ40, BJ60, EU5
- **Bentley**: Mulsanne, Azure, Arnage
- **BMW**: 1 Series, 2 Series, 4 Series, XM, Z4, i3, i4, i5, i7, iX, M2, M3, M4, M5
- **Bugatti**: Veyron, Chiron, Divo, Centodieci, Bolide, Tourbillon
- **Buick**: Encore, Encore GX, Envision, Enclave, Regal, LaCrosse, Verano
- **BYD**: Seal, Han, Destroyer 05, Qin Plus
- **Cadillac**: CT4, CT5, XT4, XT5, XT6, Lyriq, Celestiq
- **Chery**: Tiggo 2 Pro, Arrizo 5, EQ1
- **Chevrolet**: Spark, Sonic, Cruze, Malibu, Traverse
- **Citroen**: C1, C3, C3 Aircross, C4, C4 Cactus, C5 Aircross, Berlingo
- **Daewoo**: Matiz, Lanos, Nubira, Lacetti, Leganza, Espero
- **Daihatsu**: Mira, Move, Charade, Sirion, Terios, Ayla, Sigra, Gran Max
- **DFSK**: Glory 500, Glory 560, Glory 580, Super Cab, C-Series, K-Series
- **Dodge**: Durango, Journey, Hornet, Grand Caravan
- **Ferrari**: Purosangue, LaFerrari
- **Fiat**: 500, 500X, 500L, Tipo, Doblo
- **Ford**: Everest, Bronco Sport, Escape, Edge
- **GAC**: GA6, GS8, GN6, GN8, M8, Emkoo
- **Geely**: Tugella, Geometry C, Monjaro, Panda Mini
- **Genesis**: GV60, GV70, GV80
- **GMC**: Terrain, Acadia, Hummer EV
- **Haval**: H6 HEV, H9, Dargo, Big Dog, M6
- **Honda**: Pilot, Passport, Ridgeline, e:N1
- **Hyundai**: Ioniq 5, Ioniq 6, Kona, Venue
- **Infiniti**: Q30, Q50, Q60, Q70, QX30, QX50, QX55, QX60, QX80
- **Isuzu**: Crosswind, Sportivo, Traviz, mu-X, N-Series
- **Jaguar**: XE, XF, XJ, E-Pace, F-Pace, I-Pace, F-Type
- **Jeep**: Commander, Wagoneer
- **Kia**: Rio, K5, Sorento, Sonet, EV5, EV6, EV9, Telluride
- **Lamborghini**: Countach
- **Lancia**: Delta, Thema, Voyager
- **Lexus**: CT, ES, IS, LS, GS, NX, RX, GX, LX, UX, LBX, LC, RC, RZ, TX
- **Lincoln**: Corsair, Nautilus, Aviator, MKZ, Continental
- **Lotus**: Elise, Exige, Evora
- **Maxus**: D60
- **Mazda**: Mazda3, Mazda6, CX-8, CX-9, CX-90, MX-30
- **McLaren**: 540C, 570S, 600LT, 650S, GT, P1, Senna
- **Mercedes-Benz**: A-Class, B-Class, CLA, CLS, G-Class, V-Class, EQS, EQE, EQB
- **MG**: MG VS, MG 4, MG Marvel R, MG Cyberster
- **Mini**: Cooper, Cooper S, Clubman, Countryman, Paceman, Convertible, John Cooper Works
- **Mitsubishi**: Eclipse Cross, Outlander, Pajero, L300, Delica
- **Nissan**: Pathfinder, Armada, Leaf
- **Opel**: Insignia, Mokka, Crossland, Grandland, Combo
- **Peugeot**: 108, 208, 308, 408, 508, 2008, 3008, 5008, Rifter
- **RAM**: 1500, 2500, 3500
- **Renault**: Captur, Kadjar, Koleos, Duster, Trafic, Master, Zoe
- **Rivian**: R1S, EDV
- **Rolls-Royce**: Wraith, Dawn
- **SEAT**: Arona, Ateca, Tarraco
- **Skoda**: Octavia, Superb, Scala, Kamiq, Karoq, Kodiaq, Enyaq
- **SsangYong**: Tivoli, Korando, Rexton, Stavic, Actyon, Torres
- **Subaru**: Levorg, Impreza, Legacy, Ascent
- **Suzuki**: Dzire, Carry
- **Tesla**: Roadster
- **Toyota**: Tacoma, Tundra, Highlander
- **TVR**: Griffith, Chimaera, Tuscan, Sagaris, Cerbera
- **Volkswagen**: Passat, Arteon, ID.3, ID.4, Caddy, Multivan
- **Volvo**: S60, S90, V60, V90, C40 Recharge
- **Wuling**: Bingo, Almaz, Formo, Hongguang Mini EV

Regenerate: `node backend/scripts/vehicle-classification-coverage.js --write-report`. Read-only live audit: append `--database` without `--write-report`.
