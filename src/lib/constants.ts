// Public/publishable keys only — private keys go in Lovable Cloud secrets
import { BRAND } from '@/config/brand';

export const GA_MEASUREMENT_ID = 'G-BK613PL2H1';
export const GTM_ID = 'GTM-MZP5DFWF';
export const APP_URL = BRAND.url;
export const APP_NAME = BRAND.name;
export const APP_TAGLINE = BRAND.tagline;

// Stripe publishable key (safe for client)
export const STRIPE_PUBLISHABLE_KEY = 'pk_test_51T8tooDF3OLOVagxcZYL7xp4hRBkxu5j3xTQxs1D9LjrTKavVffraJNu1aBlmPAyzyFbNZMH7PNtUJRsz5eVbVjS000VxsX1Ok';

// Complete S&P 500 constituents (503 tickers)
// Source: https://en.wikipedia.org/wiki/List_of_S%26P_500_companies
export const SP500_TICKERS: string[] = [
  'AAPL','ABBV','ABT','ACN','ADBE','ADI','ADM','ADP','ADSK','AEE',
  'AEP','AES','AFL','AIG','AIZ','AJG','AKAM','ALB','ALGN','ALK',
  'ALL','ALLE','AMAT','AMCR','AMD','AME','AMGN','AMP','AMT','AMZN',
  'ANET','ANSS','AON','AOS','APA','APD','APH','APTV','ARE','ATO',
  'ATVI','AVB','AVGO','AVY','AWK','AXP','AZO',
  'BA','BAC','BAX','BBWI','BBY','BDX','BEN','BF.B','BG','BIIB',
  'BIO','BK','BKNG','BKR','BLK','BMY','BR','BRK.B','BRO','BSX',
  'BWA','BXP',
  'C','CAG','CAH','CARR','CAT','CB','CBOE','CBRE','CCI','CCL',
  'CDAY','CDNS','CDW','CE','CEG','CF','CFG','CHD','CHRW','CHTR',
  'CI','CINF','CL','CLX','CMA','CMCSA','CME','CMG','CMI','CMS',
  'CNC','CNP','COF','COO','COP','COR','COST','CPB','CPRT','CPT',
  'CRL','CRM','CSCO','CSGP','CSX','CTAS','CTLT','CTRA','CTSH','CTVA',
  'CVS','CVX',
  'D','DAL','DAY','DD','DE','DECK','DFS','DG','DGX','DHI',
  'DHR','DIS','DLTR','DOV','DOW','DPZ','DRI','DTE','DUK','DVA','DVN',
  'DXCM',
  'EA','EBAY','ECL','ED','EFX','EIX','EL','EMN','EMR','ENPH',
  'EOG','EPAM','EQIX','EQR','EQT','ES','ESS','ETN','ETR','ETSY',
  'EVRG','EW','EXC','EXPD','EXPE','EXR',
  'F','FANG','FAST','FBHS','FCX','FDS','FDX','FE','FFIV','FI',
  'FICO','FIS','FISV','FITB','FLT','FMC','FOX','FOXA','FRT','FSLR',
  'FTNT','FTV',
  'GD','GDDY','GE','GEHC','GEN','GILD','GIS','GL','GLW','GM',
  'GNRC','GOOG','GOOGL','GPC','GPN','GRMN','GS','GWW',
  'HAL','HAS','HBAN','HCA','PEAK','HD','HOLX','HON','HPE','HPQ',
  'HRL','HSIC','HST','HSY','HUBB','HUM','HWM','HII',
  'IBM','ICE','IDXX','IEX','IFF','ILMN','INCY','INTC','INTU','INVH',
  'IP','IPG','IQV','IR','IRM','ISRG','IT','ITW','IVZ',
  'J','JBHT','JCI','JKHY','JNJ','JNPR','JPM',
  'K','KDP','KEY','KEYS','KHC','KIM','KLAC','KMB','KMI','KMX','KO','KR',
  'KVUE',
  'L','LDOS','LEN','LH','LHX','LIN','LKQ','LLY','LMT','LNT',
  'LOW','LRCX','LULU','LUV','LVS','LW','LYB','LYV',
  'MA','MAA','MAR','MAS','MCD','MCHP','MCK','MCO','MDLZ','MDT',
  'MET','META','MGM','MHK','MKC','MKTX','MLM','MMC','MMM','MNST',
  'MO','MOH','MOS','MPC','MPWR','MRK','MRNA','MRO','MS','MSCI',
  'MSFT','MSI','MTB','MTCH','MTD','MU',
  'NCLH','NDAQ','NDSN','NEE','NEM','NFLX','NI','NKE','NOC','NOW',
  'NRG','NSC','NTAP','NTRS','NUE','NVDA','NVR','NWL','NWS','NWSA',
  'NXPI',
  'O','ODFL','OGN','OKE','OMC','ON','ORCL','ORLY','OTIS','OXY',
  'PARA','PAYC','PAYX','PCAR','PCG','PEG','PEP','PFE','PFG','PG',
  'PGR','PH','PHM','PKG','PLD','PM','PNC','PNR','PNW','POOL',
  'PPG','PPL','PRU','PSA','PSX','PTC','PVH','PWR','PXD',
  'QCOM','QRVO',
  'RCL','REG','REGN','RF','RHI','RJF','RL','RMD','ROK','ROL',
  'ROP','ROST','RSG','RTX',
  'SBAC','SBNY','SBUX','SCHW','SEE','SHW','SIVB','SJM','SLB','SNA',
  'SNPS','SO','SPG','SPGI','SRE','STE','STLD','STT','STX','STZ',
  'SWK','SWKS','SYF','SYK','SYY',
  'T','TAP','TDG','TDY','TECH','TEL','TER','TFC','TFX','TGT',
  'TJX','TMO','TMUS','TPR','TRGP','TRMB','TROW','TRV','TSCO','TSLA',
  'TSN','TT','TTWO','TXN','TXT','TYL',
  'UDR','UHS','ULTA','UNH','UNP','UPS','URI','USB',
  'V','VFC','VICI','VLO','VLTO','VMC','VRSK','VRSN','VRTX','VTR','VTRS','VZ',
  'WAB','WAT','WBA','WBD','WDC','WEC','WELL','WFC','WHR','WM',
  'WMB','WMT','WRB','WRK','WST','WTW','WY','WYNN',
  'XEL','XOM','XRAY','XYL',
  'YUM',
  'ZBH','ZBRA','ZION','ZTS',
];
