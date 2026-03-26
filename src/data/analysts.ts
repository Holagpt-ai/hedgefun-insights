export interface Analyst {
  rank: number;
  name: string;
  slug: string;
  firm: string;
  rating: number;
  sector: string;
  successRate: number;
  avgReturn: number;
  totalRatings: number;
}

export const ANALYSTS: Analyst[] = [
  { rank: 100, name: "Lloyd Byrne", slug: "lloyd-byrne", firm: "Jefferies", rating: 4.75, sector: "Energy", successRate: 64, avgReturn: 28.24, totalRatings: 143 },
  { rank: 99, name: "Colin Sebastian", slug: "colin-sebastian", firm: "Baird", rating: 4.69, sector: "Communication Services", successRate: 71, avgReturn: 24.11, totalRatings: 98 },
  { rank: 98, name: "David Raso", slug: "david-raso", firm: "Evercore ISI Group", rating: 4.73, sector: "Industrials", successRate: 68, avgReturn: 31.45, totalRatings: 167 },
  { rank: 97, name: "Joseph Quatrochi", slug: "joseph-quatrochi", firm: "Wells Fargo", rating: 4.72, sector: "Technology", successRate: 66, avgReturn: 29.88, totalRatings: 112 },
  { rank: 96, name: "Katja Jancic", slug: "katja-jancic", firm: "BMO Capital", rating: 4.73, sector: "Materials", successRate: 70, avgReturn: 26.33, totalRatings: 89 },
  { rank: 95, name: "Max Michaelis", slug: "max-michaelis", firm: "Ladenburg Thalmann", rating: 4.71, sector: "Technology", successRate: 63, avgReturn: 33.12, totalRatings: 201 },
  { rank: 94, name: "Craig Ellis", slug: "craig-ellis", firm: "B. Riley Securities", rating: 4.80, sector: "Technology", successRate: 72, avgReturn: 27.95, totalRatings: 134 },
  { rank: 93, name: "Rick Schafer", slug: "rick-schafer", firm: "Oppenheimer", rating: 4.80, sector: "Technology", successRate: 69, avgReturn: 30.22, totalRatings: 156 },
  { rank: 92, name: "Amit Daryanani", slug: "amit-daryanani", firm: "Evercore ISI Group", rating: 4.78, sector: "Technology", successRate: 74, avgReturn: 32.67, totalRatings: 178 },
  { rank: 91, name: "Matthew Akers", slug: "matthew-akers", firm: "Wells Fargo", rating: 4.79, sector: "Industrials", successRate: 61, avgReturn: 22.88, totalRatings: 94 },
  { rank: 90, name: "David Konrad", slug: "david-konrad", firm: "Keefe Bruyette & Woods", rating: 4.79, sector: "Financials", successRate: 67, avgReturn: 25.44, totalRatings: 121 },
  { rank: 89, name: "Michael Lasser", slug: "michael-lasser", firm: "UBS", rating: 4.78, sector: "Consumer Discretionary", successRate: 65, avgReturn: 24.91, totalRatings: 145 },
  { rank: 88, name: "Timothy Arcuri", slug: "timothy-arcuri", firm: "UBS", rating: 4.82, sector: "Technology", successRate: 76, avgReturn: 35.44, totalRatings: 189 },
  { rank: 87, name: "Mark Mahaney", slug: "mark-mahaney", firm: "Evercore ISI Group", rating: 4.85, sector: "Communication Services", successRate: 78, avgReturn: 38.21, totalRatings: 203 },
  { rank: 86, name: "Dan Ives", slug: "dan-ives", firm: "Wedbush Securities", rating: 4.88, sector: "Technology", successRate: 81, avgReturn: 42.33, totalRatings: 312 },
  { rank: 85, name: "Vivek Arya", slug: "vivek-arya", firm: "Bank of America", rating: 4.84, sector: "Technology", successRate: 77, avgReturn: 36.77, totalRatings: 228 },
  { rank: 84, name: "Toshiya Hari", slug: "toshiya-hari", firm: "Goldman Sachs", rating: 4.83, sector: "Technology", successRate: 75, avgReturn: 34.55, totalRatings: 195 },
  { rank: 83, name: "Pierre Ferragu", slug: "pierre-ferragu", firm: "New Street Research", rating: 4.81, sector: "Technology", successRate: 73, avgReturn: 33.88, totalRatings: 167 },
  { rank: 82, name: "Rod Hall", slug: "rod-hall", firm: "Goldman Sachs", rating: 4.77, sector: "Technology", successRate: 69, avgReturn: 28.44, totalRatings: 144 },
  { rank: 81, name: "Chris Caso", slug: "chris-caso", firm: "Wolfe Research", rating: 4.76, sector: "Technology", successRate: 71, avgReturn: 29.11, totalRatings: 138 },
];

export type RatingAction = "Buy" | "Hold" | "Sell";

export interface StockRating {
  ticker: string;
  company: string;
  date: string;
  action: RatingAction;
  currentPrice: number;
  oldTarget: number;
  newTarget: number;
  totalRatings: number;
  priceHistory: number[];
  ratingPoints: { index: number; action: RatingAction }[];
}

const SECTOR_STOCKS: Record<string, StockRating[]> = {
  Energy: [
    { ticker: "SLB", company: "Schlumberger N.V.", date: "Mar 10, 2026", action: "Buy", currentPrice: 52.34, oldTarget: 55, newTarget: 62, totalRatings: 18, priceHistory: [44, 46, 48, 45, 47, 50, 49, 52, 51, 53, 52, 52.34], ratingPoints: [{ index: 5, action: "Buy" }] },
    { ticker: "CVX", company: "Chevron Corporation", date: "Feb 22, 2026", action: "Buy", currentPrice: 161.88, oldTarget: 170, newTarget: 185, totalRatings: 24, priceHistory: [148, 150, 155, 152, 157, 160, 158, 162, 159, 163, 161, 161.88], ratingPoints: [{ index: 3, action: "Hold" }, { index: 8, action: "Buy" }] },
    { ticker: "XOM", company: "Exxon Mobil Corporation", date: "Jan 15, 2026", action: "Hold", currentPrice: 118.44, oldTarget: 125, newTarget: 120, totalRatings: 31, priceHistory: [110, 112, 115, 118, 116, 119, 117, 120, 118, 117, 119, 118.44], ratingPoints: [{ index: 2, action: "Buy" }, { index: 7, action: "Hold" }] },
    { ticker: "COP", company: "ConocoPhillips", date: "Mar 01, 2026", action: "Buy", currentPrice: 112.55, oldTarget: 115, newTarget: 128, totalRatings: 15, priceHistory: [100, 103, 106, 104, 108, 110, 107, 112, 111, 113, 112, 112.55], ratingPoints: [{ index: 6, action: "Buy" }] },
  ],
  Technology: [
    { ticker: "AAPL", company: "Apple Inc.", date: "Mar 12, 2026", action: "Buy", currentPrice: 227.48, oldTarget: 235, newTarget: 260, totalRatings: 42, priceHistory: [210, 215, 218, 220, 222, 225, 221, 228, 226, 230, 228, 227.48], ratingPoints: [{ index: 3, action: "Hold" }, { index: 9, action: "Buy" }] },
    { ticker: "NVDA", company: "NVIDIA Corporation", date: "Mar 08, 2026", action: "Buy", currentPrice: 138.25, oldTarget: 150, newTarget: 175, totalRatings: 38, priceHistory: [115, 120, 125, 128, 130, 135, 132, 138, 136, 140, 139, 138.25], ratingPoints: [{ index: 4, action: "Buy" }] },
    { ticker: "MSFT", company: "Microsoft Corporation", date: "Feb 28, 2026", action: "Buy", currentPrice: 415.33, oldTarget: 420, newTarget: 460, totalRatings: 35, priceHistory: [380, 385, 390, 395, 400, 405, 398, 410, 408, 415, 412, 415.33], ratingPoints: [{ index: 2, action: "Buy" }, { index: 7, action: "Buy" }] },
    { ticker: "AMD", company: "Advanced Micro Devices", date: "Jan 30, 2026", action: "Hold", currentPrice: 164.77, oldTarget: 180, newTarget: 170, totalRatings: 28, priceHistory: [150, 155, 160, 158, 162, 165, 160, 168, 165, 167, 164, 164.77], ratingPoints: [{ index: 5, action: "Buy" }, { index: 9, action: "Hold" }] },
    { ticker: "AVGO", company: "Broadcom Inc.", date: "Mar 05, 2026", action: "Buy", currentPrice: 224.11, oldTarget: 230, newTarget: 260, totalRatings: 22, priceHistory: [195, 200, 205, 210, 208, 215, 212, 220, 218, 225, 222, 224.11], ratingPoints: [{ index: 6, action: "Buy" }] },
  ],
  Financials: [
    { ticker: "JPM", company: "JPMorgan Chase & Co.", date: "Mar 11, 2026", action: "Buy", currentPrice: 254.88, oldTarget: 260, newTarget: 285, totalRatings: 29, priceHistory: [230, 235, 240, 238, 245, 250, 248, 255, 252, 257, 254, 254.88], ratingPoints: [{ index: 4, action: "Buy" }] },
    { ticker: "BAC", company: "Bank of America Corp", date: "Feb 18, 2026", action: "Buy", currentPrice: 44.12, oldTarget: 45, newTarget: 50, totalRatings: 22, priceHistory: [38, 39, 40, 41, 42, 43, 41, 44, 43, 45, 44, 44.12], ratingPoints: [{ index: 3, action: "Hold" }, { index: 8, action: "Buy" }] },
    { ticker: "GS", company: "Goldman Sachs Group", date: "Mar 02, 2026", action: "Buy", currentPrice: 612.44, oldTarget: 620, newTarget: 680, totalRatings: 18, priceHistory: [560, 570, 580, 575, 590, 600, 595, 610, 608, 615, 612, 612.44], ratingPoints: [{ index: 5, action: "Buy" }] },
    { ticker: "WFC", company: "Wells Fargo & Co.", date: "Jan 25, 2026", action: "Hold", currentPrice: 75.33, oldTarget: 78, newTarget: 76, totalRatings: 25, priceHistory: [68, 70, 72, 71, 73, 75, 74, 76, 75, 76, 75, 75.33], ratingPoints: [{ index: 2, action: "Buy" }, { index: 8, action: "Hold" }] },
  ],
  "Communication Services": [
    { ticker: "META", company: "Meta Platforms Inc.", date: "Mar 10, 2026", action: "Buy", currentPrice: 615.22, oldTarget: 620, newTarget: 700, totalRatings: 36, priceHistory: [550, 560, 575, 580, 590, 600, 595, 610, 608, 618, 615, 615.22], ratingPoints: [{ index: 3, action: "Buy" }, { index: 8, action: "Buy" }] },
    { ticker: "GOOGL", company: "Alphabet Inc.", date: "Feb 20, 2026", action: "Buy", currentPrice: 176.55, oldTarget: 180, newTarget: 200, totalRatings: 32, priceHistory: [155, 158, 162, 165, 168, 170, 172, 175, 174, 178, 176, 176.55], ratingPoints: [{ index: 5, action: "Buy" }] },
    { ticker: "NFLX", company: "Netflix Inc.", date: "Mar 06, 2026", action: "Hold", currentPrice: 988.44, oldTarget: 1000, newTarget: 980, totalRatings: 28, priceHistory: [920, 935, 950, 960, 970, 985, 975, 990, 985, 995, 988, 988.44], ratingPoints: [{ index: 4, action: "Buy" }, { index: 9, action: "Hold" }] },
    { ticker: "DIS", company: "Walt Disney Company", date: "Jan 28, 2026", action: "Buy", currentPrice: 112.88, oldTarget: 115, newTarget: 130, totalRatings: 24, priceHistory: [95, 98, 100, 103, 105, 108, 106, 110, 112, 114, 113, 112.88], ratingPoints: [{ index: 6, action: "Buy" }] },
  ],
  Industrials: [
    { ticker: "CAT", company: "Caterpillar Inc.", date: "Mar 09, 2026", action: "Buy", currentPrice: 378.12, oldTarget: 380, newTarget: 420, totalRatings: 20, priceHistory: [340, 348, 355, 360, 365, 370, 368, 375, 378, 382, 380, 378.12], ratingPoints: [{ index: 4, action: "Buy" }] },
    { ticker: "DE", company: "Deere & Company", date: "Feb 15, 2026", action: "Hold", currentPrice: 488.55, oldTarget: 500, newTarget: 490, totalRatings: 16, priceHistory: [450, 460, 468, 475, 480, 485, 482, 490, 488, 492, 489, 488.55], ratingPoints: [{ index: 3, action: "Buy" }, { index: 8, action: "Hold" }] },
    { ticker: "HON", company: "Honeywell International", date: "Mar 03, 2026", action: "Buy", currentPrice: 222.88, oldTarget: 225, newTarget: 250, totalRatings: 22, priceHistory: [200, 205, 210, 212, 215, 218, 216, 220, 222, 225, 223, 222.88], ratingPoints: [{ index: 5, action: "Buy" }] },
    { ticker: "GE", company: "General Electric Co.", date: "Jan 20, 2026", action: "Buy", currentPrice: 198.44, oldTarget: 200, newTarget: 220, totalRatings: 18, priceHistory: [175, 180, 185, 188, 190, 193, 195, 198, 196, 200, 199, 198.44], ratingPoints: [{ index: 6, action: "Buy" }] },
  ],
  Materials: [
    { ticker: "LIN", company: "Linde plc", date: "Mar 07, 2026", action: "Buy", currentPrice: 478.33, oldTarget: 480, newTarget: 520, totalRatings: 14, priceHistory: [440, 448, 455, 460, 465, 470, 468, 475, 478, 482, 480, 478.33], ratingPoints: [{ index: 4, action: "Buy" }] },
    { ticker: "APD", company: "Air Products & Chemicals", date: "Feb 10, 2026", action: "Hold", currentPrice: 312.55, oldTarget: 320, newTarget: 310, totalRatings: 11, priceHistory: [290, 295, 300, 305, 308, 310, 308, 312, 310, 315, 313, 312.55], ratingPoints: [{ index: 3, action: "Buy" }, { index: 8, action: "Hold" }] },
    { ticker: "NEM", company: "Newmont Corporation", date: "Mar 04, 2026", action: "Buy", currentPrice: 48.77, oldTarget: 50, newTarget: 58, totalRatings: 16, priceHistory: [40, 42, 43, 44, 45, 46, 47, 48, 47, 49, 48, 48.77], ratingPoints: [{ index: 5, action: "Buy" }] },
    { ticker: "FCX", company: "Freeport-McMoRan Inc.", date: "Jan 18, 2026", action: "Buy", currentPrice: 44.22, oldTarget: 45, newTarget: 52, totalRatings: 19, priceHistory: [36, 38, 39, 40, 41, 42, 43, 44, 43, 45, 44, 44.22], ratingPoints: [{ index: 6, action: "Buy" }] },
  ],
  "Consumer Discretionary": [
    { ticker: "AMZN", company: "Amazon.com Inc.", date: "Mar 11, 2026", action: "Buy", currentPrice: 228.44, oldTarget: 230, newTarget: 260, totalRatings: 40, priceHistory: [200, 205, 210, 215, 218, 222, 220, 225, 228, 232, 230, 228.44], ratingPoints: [{ index: 3, action: "Buy" }, { index: 8, action: "Buy" }] },
    { ticker: "HD", company: "The Home Depot Inc.", date: "Feb 25, 2026", action: "Hold", currentPrice: 412.88, oldTarget: 420, newTarget: 415, totalRatings: 26, priceHistory: [380, 388, 395, 400, 405, 410, 408, 415, 412, 418, 414, 412.88], ratingPoints: [{ index: 5, action: "Buy" }, { index: 9, action: "Hold" }] },
    { ticker: "MCD", company: "McDonald's Corporation", date: "Mar 02, 2026", action: "Buy", currentPrice: 298.55, oldTarget: 300, newTarget: 330, totalRatings: 22, priceHistory: [270, 275, 280, 285, 288, 292, 290, 295, 298, 302, 300, 298.55], ratingPoints: [{ index: 4, action: "Buy" }] },
    { ticker: "NKE", company: "Nike Inc.", date: "Jan 22, 2026", action: "Sell", currentPrice: 72.33, oldTarget: 85, newTarget: 68, totalRatings: 30, priceHistory: [88, 85, 82, 80, 78, 76, 75, 73, 74, 72, 73, 72.33], ratingPoints: [{ index: 2, action: "Hold" }, { index: 7, action: "Sell" }] },
  ],
};

const SECTOR_INDUSTRIES: Record<string, string[]> = {
  Energy: ["Oil & Gas Exploration", "Oilfield Services", "Refining & Marketing", "Midstream"],
  Technology: ["Semiconductors", "Software Infrastructure", "Consumer Electronics", "Cloud Computing", "IT Services"],
  Financials: ["Banks — Diversified", "Capital Markets", "Insurance", "Financial Data"],
  "Communication Services": ["Internet Content", "Entertainment", "Advertising", "Telecom Services"],
  Industrials: ["Aerospace & Defense", "Farm Machinery", "Conglomerates", "Electrical Equipment"],
  Materials: ["Specialty Chemicals", "Industrial Gases", "Gold Mining", "Copper"],
  "Consumer Discretionary": ["Internet Retail", "Home Improvement", "Restaurants", "Footwear & Accessories"],
};

export function getAnalystBySlug(slug: string): Analyst | undefined {
  return ANALYSTS.find((a) => a.slug === slug);
}

export function getStockRatingsForSector(sector: string): StockRating[] {
  return SECTOR_STOCKS[sector] ?? SECTOR_STOCKS["Technology"];
}

export function getIndustriesForSector(sector: string): string[] {
  return SECTOR_INDUSTRIES[sector] ?? SECTOR_INDUSTRIES["Technology"];
}
