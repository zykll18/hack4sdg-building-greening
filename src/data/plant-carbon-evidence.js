// Net ecosystem exchange/production includes plants AND substrate respiration.
// These are foreign-site observations, never project credits or a 20-year forecast.
export const PLANT_CARBON_STUDIES = Object.freeze([
  Object.freeze({
    id:'zhengzhou-sedum-lineare-2026',
    title:'City-scale assessment of green-roof carbon: high-frequency chamber fluxes and district inventories reveal microclimate-driven sinks and seasonal resilience',
    url:'https://doi.org/10.1016/j.buildenv.2026.114431',year:2026,
    speciesIds:['sedum-lineare'],metric:'ecosystem-net-production',regionTypes:['roof'],
    site:'郑州 · 滴灌佛甲草参考屋顶',netUptakeGramsCPerM2Year:351.91,
    observation:'18个月单个屋顶通量监测的年化NEP；24处屋顶的碳储量盘查与该通量观测分开。',
    applicability:'同植物的外地滴灌案例；气候、基质与维护不同，未经香港项目校准。'
  }),
  Object.freeze({
    id:'berlin-extensive-roof-2026',
    title:'Net ecosystem exchange of extensive green roofs: the role of coupled energy, carbon, and water fluxes quantified by long-term micrometeorological observations',
    url:'https://bg.copernicus.org/articles/23/5035/2026/',year:2026,
    speciesIds:[],metric:'ecosystem-net-exchange',regionTypes:['roof'],
    site:'柏林 · 非灌溉混合景天屋顶',netUptakeGramsCPerM2Year:92,
    observation:'2015–2023年平均NEE为−92 g C/㎡/年；最后两年转为净排放。以吸收为正时，均值为+92。',
    applicability:'不同气候与景天组合，仅作长期变化的对照；不是佛甲草香港系数。'
  })
]);

// Annual ecosystem flux, first-year stock change, and leaf photosynthesis are distinct metrics.
// Only exact species matches get a numerical literature reference; none is a project factor.
export const PLANT_CARBON_SOURCES = Object.freeze([
  ...PLANT_CARBON_STUDIES,
  {
    id:'chiba-ophiopogon-first-year-2017',speciesIds:['ophiopogon-japonicus'],year:2017,
    title:'Relevance of Carbon Sequestration to the Physiological and Morphological Traits of Several Green Roof Plants during the First Year after Construction',
    url:'https://www.scirp.org/journal/paperinformation?paperid=72981',locator:'§2.1–2.2, §3.5, Table 6 and §4.1',
    site:'日本千叶 · Tama-Ryu麦冬品种 · 湿润灌溉处理',metric:'first-year-stock-change',regionTypes:['roof'],
    firstYearStockIncreaseGramsCPerM2:282,
    observation:'2014年10月至2015年10月植物＋基质碳含量的首年增量，282 g C/㎡；5cm人工基质、盆栽屋顶试验，施肥并按季节灌溉。',
    applicability:'特定麦冬栽培品种与首年建植情景，不是每年稳定固碳，也不是香港屋顶或200–300mm构造的实测系数。'
  },
  {
    id:'amazon-mixed-pasture-arachis-2016',speciesIds:['arachis-pintoi'],year:2016,
    title:'Soil carbon sequestration in grass and grass-legume pastures in the western Brazilian Amazon',
    url:'https://www.alice.cnptia.embrapa.br/bitstream/doc/1057480/1/26211.pdf',locator:'Embrapa research report, methods and soil-stock comparison',
    site:'巴西亚马逊 · 多年生花生与牧草混种',metric:'mixed-system-soil-stock',regionTypes:[],
    observation:'研究比较纯牧草、牧草与多年生花生混种的土壤碳储量变化；系统包含其他植物及深层土壤。',
    applicability:'不能把混种牧场土壤储碳分摊为花生单物种系数，也不能移植到浅层屋顶；暂无适用的年度建筑绿化系数。'
  },
  {
    id:'shenzhen-ficus-photosynthesis-2008',speciesIds:['ficus-pumila'],year:2008,
    title:'华南12种垂直绿化植物的生态效应',
    url:'https://journal.scau.edu.cn/cn/article/pdf/preview/10.7671/j.issn.1001-411X.2008.02.003.pdf',locator:'§1.2–1.3 and §2.1',
    site:'深圳 · 3年生薜荔 · 夏季叶片观测',metric:'leaf-photosynthesis',regionTypes:['facade'],
    observation:'通过叶面积指数及2005年夏季光合、蒸腾观测估算日尺度效益；夜间暗呼吸按白天同化量20%估算。',
    applicability:'叶面积与绿墙面积口径不同，日尺度光合结果未涵盖全年生长和土壤呼吸，不能直接乘365作为年度净吸碳。'
  },
  {
    id:'oak-forest-trachelospermum-2017',speciesIds:['trachelospermum-jasminoides'],year:2017,
    title:'Effects of Understory Liana Trachelospermum jasminoides on Distributions of Litterfall and Soil Organic Carbon in an Oak Forest in Central China',
    url:'https://doi.org/10.3390/su9061019',locator:'Abstract and conclusions',
    site:'中国中部 · 栎树林下络石',metric:'forest-carbon-cycling',regionTypes:[],
    observation:'较密络石样地的凋落物和土壤有机碳较高，同时土壤呼吸也较高。',
    applicability:'森林碳循环的相关观测，不是建筑绿墙的年度净减排；暂无适用的单位覆盖面积年度系数。'
  },
  {
    id:'guangzhou-climbers-2019',speciesIds:['parthenocissus-dalzielii','bougainvillea-spectabilis'],year:2019,
    title:'广州市6种攀援植物降温增湿效应研究',
    url:'https://www.yrdzwkx.com/CN/Y2019/V48/I02/145',locator:'Abstract; DOI 10.3969/j.issn.1009-7791.2019.02.008',
    site:'广州 · 六种攀援植物比较',metric:'photosynthesis-and-microclimate',regionTypes:['facade'],
    observation:'通过叶面积指数、光合与蒸腾比较固碳释氧及降温增湿；叶子花在所测六种中单位绿地面积固碳释氧较高，异叶爬墙虎增湿效果较好。',
    applicability:'目前核对到摘要与方法口径，未核定可用于建筑全年的净吸碳系数；不能把降温幅度当成固定节电量。'
  }
]);

// Curated screening scenarios requested by the user. Biomass production is a carbon flow,
// not an observed stock increase, net ecosystem uptake or permanent avoided emission.
const biomassCarbonSource = Object.freeze({
  title:'Productive urban green façades – Biomass and bioenergy (2025)',
  url:'https://doi.org/10.1016/j.ufug.2025.128951',
  locator:'Abstract: 0.12–0.64 kg DM/m² façade/year across five species; §3.1 / discussion uses 0.42 for C-to-DM conversion'
});
export const PLANT_CARBON_ESTIMATES = Object.freeze([
  {
    id:'arachis-forage-biomass-analogy-1',speciesIds:['arachis-pintoi'],
    label:'多年生花生 · 牧草产量情景换算',regionTypes:['ground'],areaBasis:'水平种植面积',
    annualDryBiomassKgPerM2:{min:.52,max:.96},assumedCarbonFraction:.42,
    evidenceBasis:'same-species-different-growing-system',
    sources:[{title:'Grof: Forage Attributes of the Perennial Groundnut Arachis pintoi in a Tropical Savanna Environment in Colombia',
      url:'https://uknowledge.uky.edu/igc/1989/session14/27/',locator:'Archived abstract: A. pintoi component 5.2–9.6 t DM/ha/year; harvested every 4 weeks'},biomassCarbonSource],
    assumptions:['原研究为哥伦比亚与牧草混种的田间系统，数值是其中多年生花生的干物质产量，不是混种总产量。',
      '5.2–9.6吨干物质/公顷/年 ÷10 = 0.52–0.96 kg/㎡/年；含碳率42%为统一情景假设，非该植物实测。',
      '仅作有利生长与定期收割条件下的生产潜力类比；浅层屋顶、花箱、遮阴或供水不足不直接适用。']
  },
  {
    id:'climber-facade-biomass-analogy-1',speciesIds:['ficus-pumila','trachelospermum-jasminoides','parthenocissus-dalzielii','bougainvillea-spectabilis'],
    label:'攀援绿墙 · 同类植物生物量情景换算',regionTypes:['facade'],areaBasis:'绿化立面面积，非叶面积或根部占地',
    annualDryBiomassKgPerM2:{min:.12,max:.64},assumedCarbonFraction:.42,
    evidenceBasis:'different-species-functional-group-analogy',sources:[biomassCarbonSource],
    assumptions:['原研究在柏林测量常春藤、三叶爬山虎等五种攀援植物，并未实测本库这四种植物。',
      '采用摘要中的各物种平均干物质生产率范围0.12–0.64 kg/㎡立面/年，不是本项目的置信区间。',
      '四种植物暂用同一功能类型范围，不虚构单物种高低；含碳率42%是统一换算假设。',
      '气候、支撑高度、覆盖成熟度、水肥和修剪条件均需核对；屋顶或庭院种植不套用立面面积系数。']
  }
]);
