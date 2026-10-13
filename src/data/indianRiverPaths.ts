export interface IndianRiverPath {
  id: string;
  name: string;
  hindiName: string;
  basin: string;
  origin: string;
  outflow: string;
  lengthKm: number;
  states: string[];
  color: string;
  keyStretches: string;
  coordinates: [number, number][]; // [lat, lng] array
}

export const INDIAN_RIVERS: IndianRiverPath[] = [
  {
    id: 'ganga',
    name: 'Ganga River',
    hindiName: 'गंगा नदी',
    basin: 'Ganga Basin',
    origin: 'Gangotri / Devprayag, Uttarakhand',
    outflow: 'Bay of Bengal (Ganga Delta)',
    lengthKm: 2525,
    states: ['Uttarakhand', 'Uttar Pradesh', 'Bihar', 'Jharkhand', 'West Bengal'],
    color: '#0284C7', // Sky-Blue
    keyStretches: 'Haridwar · Kanpur · Prayagraj · Varanasi · Patna · Howrah',
    coordinates: [
      [30.98, 78.93], // Gangotri
      [30.15, 78.60], // Devprayag (Alaknanda-Bhagirathi confluence)
      [30.08, 78.26], // Rishikesh
      [29.94, 78.16], // Haridwar
      [29.45, 78.02], // Bijnor
      [28.78, 78.10], // Garhmukteshwar
      [28.20, 78.38], // Narora Barrage
      [27.60, 79.40], // Farrukhabad
      [27.05, 79.91], // Kannauj
      [26.47, 80.35], // Kanpur
      [26.15, 80.85], // Dalmau
      [25.43, 81.88], // Prayagraj Sangam (Yamuna confluence)
      [25.22, 82.56], // Mirzapur
      [25.31, 83.00], // Varanasi
      [25.58, 83.58], // Ghazipur
      [25.57, 83.98], // Buxar
      [25.61, 85.14], // Patna
      [25.37, 86.47], // Munger
      [25.24, 87.01], // Bhagalpur
      [25.04, 87.63], // Kahalgaon
      [24.81, 87.92], // Farakka Barrage
      [24.06, 88.26], // Murshidabad
      [23.41, 88.37], // Nabadwip (Bhagirathi-Hooghly)
      [22.58, 88.35], // Kolkata / Howrah
      [22.19, 88.19], // Diamond Harbour
      [21.65, 88.05], // Sagar Island / Bay of Bengal
    ],
  },
  {
    id: 'yamuna',
    name: 'Yamuna River',
    hindiName: 'यमुना नदी',
    basin: 'Ganga Basin (Yamuna Sub-basin)',
    origin: 'Yamunotri Glacier, Uttarkashi, Uttarakhand',
    outflow: 'Confluence with Ganga at Triveni Sangam, Prayagraj',
    lengthKm: 1376,
    states: ['Uttarakhand', 'Himachal Pradesh', 'Haryana', 'Delhi', 'Uttar Pradesh'],
    color: '#0D9488', // Teal
    keyStretches: 'Paonta Sahib · Panipat · Delhi (Wazirabad to Okhla) · Mathura · Agra · Prayagraj',
    coordinates: [
      [31.01, 78.46], // Yamunotri
      [30.55, 77.82], // Dakpathar
      [30.44, 77.62], // Paonta Sahib
      [30.31, 77.58], // Hathnikund Barrage
      [30.12, 77.30], // Yamunanagar
      [29.68, 77.05], // Karnal
      [29.39, 77.13], // Panipat (Khojipur)
      [28.99, 77.20], // Sonipat (Palla)
      [28.71, 77.22], // Wazirabad Barrage / Delhi
      [28.62, 77.26], // ITO Bridge / Nizamuddin
      [28.54, 77.30], // Okhla Barrage
      [28.38, 77.55], // Faridabad
      [27.85, 77.65], // Palwal / Kosi Kalan
      [27.58, 77.70], // Vrindavan
      [27.49, 77.68], // Mathura
      [27.18, 78.02], // Agra
      [26.94, 78.54], // Bateshwar
      [26.77, 79.03], // Etawah
      [26.45, 79.48], // Auraiya
      [26.15, 79.92], // Kalpi
      [25.95, 80.15], // Hamirpur
      [25.43, 81.88], // Triveni Sangam, Prayagraj
    ],
  },
  {
    id: 'godavari',
    name: 'Godavari River',
    hindiName: 'गोदावरी नदी (दक्षिण गंगा)',
    basin: 'Godavari Basin',
    origin: 'Trimbakeshwar, Nashik, Maharashtra',
    outflow: 'Bay of Bengal (Godavari Delta at Narasapuram & Antarvedi)',
    lengthKm: 1465,
    states: ['Maharashtra', 'Telangana', 'Andhra Pradesh', 'Chhattisgarh', 'Odisha'],
    color: '#2563EB', // Royal Blue
    keyStretches: 'Trimbakeshwar · Nashik · Nanded · Basar · Bhadrachalam · Rajahmundry · Dowleswaram',
    coordinates: [
      [19.93, 73.53], // Trimbakeshwar
      [19.99, 73.79], // Nashik
      [19.89, 74.48], // Kopargaon
      [19.48, 75.38], // Paithan (Jayakwadi Dam)
      [19.15, 77.31], // Nanded
      [18.88, 77.96], // Basar
      [18.95, 78.35], // Sriram Sagar Project (Pochampad)
      [18.87, 79.46], // Mancherial
      [18.72, 79.88], // Kaleshwaram (Pranhita confluence)
      [18.25, 80.55], // Eturnagaram
      [17.67, 80.89], // Bhadrachalam
      [17.48, 81.35], // Kunavaram (Sabari confluence)
      [17.25, 81.65], // Polavaram Dam
      [17.00, 81.78], // Pushkar Ghat, Rajamahendravaram
      [16.94, 81.77], // Arthur Cotton Barrage, Dowleswaram
      [16.75, 81.80], // Ravulapalem
      [16.43, 81.70], // Vasishta Godavari at Narasapuram
      [16.32, 81.74], // Antarvedi / Bay of Bengal
    ],
  },
  {
    id: 'krishna',
    name: 'Krishna River',
    hindiName: 'कृष्णा नदी',
    basin: 'Krishna Basin',
    origin: 'Mahabaleshwar, Satara, Maharashtra',
    outflow: 'Bay of Bengal at Hamsaladeevi, Andhra Pradesh',
    lengthKm: 1400,
    states: ['Maharashtra', 'Karnataka', 'Telangana', 'Andhra Pradesh'],
    color: '#4F46E5', // Indigo
    keyStretches: 'Mahabaleshwar · Karad · Sangli · Almatti · Raichur · Srisailam · Nagarjuna Sagar · Vijayawada',
    coordinates: [
      [17.92, 73.66], // Mahabaleshwar
      [17.94, 73.89], // Wai
      [17.29, 74.18], // Karad (Koyna confluence)
      [16.85, 74.56], // Sangli
      [16.68, 74.85], // Miraj
      [16.58, 75.25], // Athani
      [16.32, 75.88], // Almatti Dam
      [16.18, 76.25], // Narayanpur Dam
      [16.20, 77.35], // Raichur
      [15.93, 77.43], // Tungabhadra confluence
      [16.07, 78.87], // Srisailam Dam
      [16.57, 79.31], // Nagarjuna Sagar Dam
      [16.78, 80.12], // Wadapally / Jaggayyapeta
      [16.57, 80.35], // Amaravati Capital
      [16.51, 80.61], // Prakasam Barrage, Vijayawada
      [16.20, 80.85], // Avanigadda
      [15.78, 80.93], // Hamsaladeevi / Bay of Bengal
    ],
  },
  {
    id: 'cauvery',
    name: 'Cauvery River (Kaveri)',
    hindiName: 'कावेरी नदी',
    basin: 'Cauvery Basin',
    origin: 'Talakaveri, Kodagu, Karnataka',
    outflow: 'Bay of Bengal at Poompuhar, Tamil Nadu',
    lengthKm: 805,
    states: ['Karnataka', 'Tamil Nadu', 'Kerala', 'Puducherry'],
    color: '#059669', // Emerald
    keyStretches: 'Talakaveri · Kushalnagar · Srirangapatna · Mekedatu · Hogenakkal · Mettur · Erode · Tiruchirappalli',
    coordinates: [
      [12.38, 75.49], // Talakaveri
      [12.39, 75.53], // Bhagamandala
      [12.46, 75.96], // Kushalnagar
      [12.45, 76.57], // Krishna Raja Sagara Dam (KRS)
      [12.42, 76.68], // Srirangapatna
      [12.29, 77.17], // Shivanasamudra Falls
      [12.26, 77.45], // Mekedatu Gorge
      [12.11, 77.77], // Hogenakkal Falls
      [11.79, 77.80], // Mettur Dam
      [11.45, 77.68], // Bhavani (Bhavani confluence)
      [11.34, 77.72], // Erode
      [11.12, 77.88], // Kodumudi
      [10.96, 78.08], // Karur (Amaravathi confluence)
      [10.83, 78.69], // Tiruchirappalli
      [10.83, 78.82], // Grand Anicut (Kallanai)
      [10.86, 79.13], // Thiruvaiyaru
      [10.96, 79.38], // Kumbakonam
      [11.10, 79.65], // Mayiladuthurai
      [11.14, 79.85], // Poompuhar / Bay of Bengal
    ],
  },
  {
    id: 'narmada',
    name: 'Narmada River',
    hindiName: 'नर्मदा नदी (रेवा)',
    basin: 'Narmada Basin',
    origin: 'Amarkantak Plateau, Anuppur, Madhya Pradesh',
    outflow: 'Gulf of Khambhat / Arabian Sea near Bharuch, Gujarat',
    lengthKm: 1312,
    states: ['Madhya Pradesh', 'Maharashtra', 'Gujarat'],
    color: '#7C3AED', // Violet
    keyStretches: 'Amarkantak · Mandla · Jabalpur (Bhedaghat) · Hoshangabad · Omkareshwar · Maheshwar · Sardar Sarovar · Bharuch',
    coordinates: [
      [22.67, 81.75], // Amarkantak
      [22.95, 81.08], // Dindori
      [22.60, 80.38], // Mandla
      [23.13, 79.80], // Jabalpur (Bhedaghat Marble Rocks)
      [22.95, 79.19], // Narsinghpur
      [22.75, 77.72], // Hoshangabad / Narmadapuram
      [22.38, 77.05], // Handia
      [22.24, 76.15], // Omkareshwar
      [22.17, 75.58], // Maheshwar
      [22.10, 74.90], // Barwani
      [21.83, 73.75], // Sardar Sarovar Dam, Kevadia
      [21.75, 73.20], // Rajpipla
      [21.70, 72.97], // Bharuch
      [21.64, 72.58], // Gulf of Khambhat / Arabian Sea
    ],
  },
  {
    id: 'brahmaputra',
    name: 'Brahmaputra River',
    hindiName: 'ब्रह्मपुत्र नदी (लुइत)',
    basin: 'Brahmaputra Basin',
    origin: 'Angsi Glacier, Himalayas · Enters Arunachal Pradesh as Siang',
    outflow: 'Bay of Bengal (Meghna Delta in Bangladesh)',
    lengthKm: 916, // Indian reach
    states: ['Arunachal Pradesh', 'Assam'],
    color: '#0891B2', // Cyan
    keyStretches: 'Pasighat · Dibrugarh · Majuli Island · Tezpur · Guwahati · Goalpara · Dhubri',
    coordinates: [
      [28.06, 95.33], // Pasighat (Siang becomes Brahmaputra)
      [27.60, 95.15], // Sadiya / Tinsukia
      [27.47, 94.91], // Dibrugarh
      [26.95, 94.20], // Majuli River Island
      [26.75, 93.80], // Bokakhat / Kaziranga edge
      [26.63, 92.79], // Tezpur (Kolia Bhomora Bridge)
      [26.25, 92.20], // Mangaldai
      [26.18, 91.75], // Guwahati (Saraighat Bridge)
      [26.15, 91.20], // Palashbari
      [26.17, 90.62], // Goalpara (Naranarayan Setu)
      [26.02, 89.97], // Dhubri / India-Bangladesh border
    ],
  },
  {
    id: 'mahanadi',
    name: 'Mahanadi River',
    hindiName: 'महानदी',
    basin: 'Mahanadi Basin',
    origin: 'Sihawa Mountains, Dhamtari, Chhattisgarh',
    outflow: 'Bay of Bengal near Paradeep, Odisha',
    lengthKm: 858,
    states: ['Chhattisgarh', 'Odisha'],
    color: '#D97706', // Amber
    keyStretches: 'Dhamtari · Rajim · Hirakud Dam · Sambalpur · Sonepur · Cuttack · Paradeep',
    coordinates: [
      [20.57, 81.97], // Sihawa
      [20.71, 81.55], // Dhamtari (Rudri Barrage)
      [20.97, 81.88], // Rajim (Triveni Sangam)
      [21.25, 82.20], // Arang
      [21.65, 82.95], // Seorinarayan
      [21.78, 83.35], // Chandrapur
      [21.52, 83.87], // Hirakud Dam, Sambalpur
      [20.84, 83.92], // Sonepur (Tel confluence)
      [20.84, 84.32], // Boudh
      [20.55, 84.85], // Tikarpada Gorge (Satkosia)
      [20.46, 85.88], // Cuttack (Mahanadi Barrage)
      [20.35, 86.30], // Jagatsinghpur
      [20.26, 86.67], // Paradeep Port / Bay of Bengal
    ],
  },
  {
    id: 'sabarmati',
    name: 'Sabarmati River',
    hindiName: 'साबरमती नदी',
    basin: 'Sabarmati Basin',
    origin: 'Aravalli Range, Udaipur, Rajasthan',
    outflow: 'Gulf of Khambhat near Vautha, Gujarat',
    lengthKm: 371,
    states: ['Rajasthan', 'Gujarat'],
    color: '#EA580C', // Orange
    keyStretches: 'Dharoi Dam · Gandhinagar · Ahmedabad (Sabarmati Riverfront) · Vautha',
    coordinates: [
      [24.58, 73.28], // Aravalli Hills, Rajasthan
      [24.00, 72.85], // Dharoi Dam
      [23.60, 72.75], // Himatnagar
      [23.22, 72.65], // Gandhinagar
      [23.15, 72.67], // Ahmedabad Upstream (Subhash Bridge)
      [23.03, 72.58], // Sabarmati Riverfront, Ahmedabad
      [22.91, 72.51], // Ahmedabad Downstream (Vasna Barrage)
      [22.72, 72.53], // Vautha (Seven-river confluence)
      [22.18, 72.22], // Gulf of Khambhat
    ],
  },
  {
    id: 'tapi',
    name: 'Tapi River (Tapti)',
    hindiName: 'ताप्ती नदी',
    basin: 'Tapi Basin',
    origin: 'Multai, Betul, Madhya Pradesh',
    outflow: 'Gulf of Khambhat / Arabian Sea at Dumas, Surat',
    lengthKm: 724,
    states: ['Madhya Pradesh', 'Maharashtra', 'Gujarat'],
    color: '#CA8A04', // Yellow-Amber
    keyStretches: 'Multai · Burhanpur · Bhusawal · Prakasha · Surat · Dumas',
    coordinates: [
      [21.77, 78.25], // Multai Sacred Tank
      [21.55, 77.50], // Melghat Tiger Reserve edge
      [21.30, 76.23], // Burhanpur
      [21.05, 75.78], // Bhusawal (Hathnur Dam)
      [21.15, 75.30], // Jalgaon
      [21.53, 74.42], // Prakasha (Shahada)
      [21.25, 73.35], // Ukai Dam
      [21.17, 72.83], // Surat City (Causeway)
      [21.08, 72.71], // Dumas Beach / Arabian Sea
    ],
  },
  {
    id: 'sutlej',
    name: 'Sutlej River (Satluj)',
    hindiName: 'सतलुज नदी',
    basin: 'Indus Basin',
    origin: 'Lake Rakshastal, Tibet · Enters Himachal Pradesh at Shipki La',
    outflow: 'Chenab / Indus System at Harike Barrage, Punjab',
    lengthKm: 520, // Indian stretch
    states: ['Himachal Pradesh', 'Punjab'],
    color: '#0284C7',
    keyStretches: 'Kinnaur · Rampur · Bilaspur (Gobind Sagar) · Bhakra Dam · Anandpur Sahib · Ropar · Phillaur · Harike',
    coordinates: [
      [31.85, 78.50], // Kinnaur Valley
      [31.50, 77.63], // Rampur Bushahr
      [31.35, 76.43], // Bhakra Nangal Dam / Gobind Sagar
      [31.23, 76.50], // Anandpur Sahib
      [30.97, 76.52], // Ropar (Rupnagar Barrage)
      [31.02, 75.78], // Phillaur / Ludhiana
      [31.17, 74.95], // Harike Wetland (Beas confluence)
      [30.92, 74.60], // Firozpur / Hussainiwala
    ],
  },
  {
    id: 'beas',
    name: 'Beas River',
    hindiName: 'ब्यास नदी (विपाशा)',
    basin: 'Indus Basin',
    origin: 'Beas Kund, Rohtang Pass, Himachal Pradesh',
    outflow: 'Confluence with Sutlej at Harike Wetland, Punjab',
    lengthKm: 470,
    states: ['Himachal Pradesh', 'Punjab'],
    color: '#06B6D4',
    keyStretches: 'Manali · Kullu · Mandi · Pandoh Dam · Pong Dam · Harike',
    coordinates: [
      [32.36, 77.08], // Beas Kund / Rohtang Pass
      [32.24, 77.19], // Manali
      [31.96, 77.11], // Kullu
      [31.71, 76.93], // Mandi
      [31.67, 77.00], // Pandoh Dam
      [31.97, 75.95], // Pong Dam (Maharana Pratap Sagar)
      [31.75, 75.50], // Mukerian
      [31.52, 75.25], // Beas Town / Rayya
      [31.17, 74.95], // Harike Pattan (Sutlej confluence)
    ],
  },
  {
    id: 'tungabhadra',
    name: 'Tungabhadra River',
    hindiName: 'तुंगभद्रा नदी',
    basin: 'Krishna Basin',
    origin: 'Koodli, Shimoga, Karnataka (Confluence of Tunga and Bhadra)',
    outflow: 'Confluence with Krishna River near Kurnool, Andhra Pradesh',
    lengthKm: 531,
    states: ['Karnataka', 'Andhra Pradesh', 'Telangana'],
    color: '#6366F1',
    keyStretches: 'Shimoga · Harihar · Hospet · Hampi · Mantralayam · Kurnool',
    coordinates: [
      [14.02, 75.68], // Koodli (Tunga-Bhadra confluence)
      [14.51, 75.80], // Harihar
      [14.95, 75.92], // Harapanahalli
      [15.26, 76.33], // Tungabhadra Dam, Hospet
      [15.33, 76.46], // Hampi (UNESCO Heritage Site)
      [15.65, 76.95], // Kampli / Siruguppa
      [15.93, 77.43], // Mantralayam Temple Town
      [15.83, 78.03], // Kurnool Town (Krishna confluence)
    ],
  },
  {
    id: 'damodar',
    name: 'Damodar River',
    hindiName: 'दामोदर नदी',
    basin: 'Ganga Basin (Hooghly Sub-basin)',
    origin: 'Chota Nagpur Plateau, Palamau, Jharkhand',
    outflow: 'Hooghly River near Shyampur, West Bengal',
    lengthKm: 592,
    states: ['Jharkhand', 'West Bengal'],
    color: '#64748B',
    keyStretches: 'Bokaro · Dhanbad (Panchet Dam) · Asansol · Durgapur Barrage · Bardhaman',
    coordinates: [
      [23.68, 84.73], // Chandwa, Palamau
      [23.75, 85.35], // Ramgarh
      [23.78, 85.95], // Bokaro Steel City
      [23.67, 86.75], // Panchet Dam, Dhanbad
      [23.68, 86.98], // Asansol / Burnpur
      [23.48, 87.32], // Durgapur Barrage
      [23.23, 87.86], // Bardhaman
      [22.85, 88.02], // Tarakeswar
      [22.28, 88.08], // Hooghly confluence
    ],
  },
  {
    id: 'periyar',
    name: 'Periyar River',
    hindiName: 'पेरियार नदी (केरल की जीवनरेखा)',
    basin: 'West Flowing Periyar Basin',
    origin: 'Sivagiri Hills, Western Ghats, Kerala',
    outflow: 'Vembanad Lake / Arabian Sea at Munambam, Kochi',
    lengthKm: 244,
    states: ['Kerala'],
    color: '#10B981',
    keyStretches: 'Thekkady · Idukki Dam · Neriamangalam · Kalady · Aluva · Kochi',
    coordinates: [
      [9.57, 77.17], // Periyar Lake / Thekkady
      [9.85, 76.97], // Idukki Arch Dam
      [10.05, 76.78], // Neriamangalam
      [10.15, 76.58], // Bhoothathankettu Dam
      [10.17, 76.44], // Kalady
      [10.11, 76.35], // Aluva
      [10.08, 76.28], // Eloor Industrial Reach
      [9.98, 76.24], // Kochi Backwaters / Arabian Sea
    ],
  },
];
