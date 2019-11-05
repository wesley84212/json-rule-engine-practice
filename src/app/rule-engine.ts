import { Engine } from 'json-rules-engine';
import { Fact, Operator } from 'json-rules-engine';

export class RuleEngine {

  constructor(private factServiceSet: any, private config: any) {

  }

  // 取得動態fact回傳值
  public cacheFact = {};
  // 個別規則輸出
  public result = [];
  /**
   * 執行Engine
   * @param {*} factReqs
   * @param {*} rules
   * @param {*} facts
   * @returns
   * @memberof RuleEngine
   */
  public async runEngine(factReqs: any, ruleSet: any, facts: any) {
    facts = { ...facts, ...this.cacheFact };
    let isSuccess: boolean = false;
    let nextRule;
    const engine = this.createEngine(factReqs, ruleSet.rules);
    try {
      await engine.on('success', async (event, almanac, ruleResult) => {

        if (event.params.onSuccess.rules) {
          isSuccess = event.params.onSuccess.rules.length > 0;
        }
        if (event.params.onSuccess) {
          nextRule = event.params.onSuccess;
        }
        for (let [key, value] of almanac.factMap) {

          if (value.options['cache'] === true && value.isDynamic()) {
            const cacheValue = await almanac.factValue(value.id);
            this.cacheFact[value.id] = cacheValue;
          }
        }
      });

      await engine.on('failure', async (event, almanac, ruleResult) => {
        if (!event.params.onFailure.rules && Object.keys(event.params.onFailure).length > 0) {
          this.result.push(event.params.onFailure);
        }
        if (event.params.onFailure.rules) {
          isSuccess = event.params.onFailure.rules.length > 0;
        }
        if (event.params.onFailure) {
          nextRule = event.params.onFailure;
        }

        for (let [key, value] of almanac.factMap) {
          if (value.options['cache'] === true && value.isDynamic()) {
            const cacheValue = await almanac.factValue(value.id);
            this.cacheFact[value.id] = cacheValue;
          }
        }
      });

      let tempResult = await engine.run(facts);
      for (let value of tempResult) {
        if (value.params.onSuccess.rules) {
          continue;
        }
        if (Object.keys(value.params.onSuccess).length === 0) {
          continue;
        }
        this.result.push(value.params.onSuccess);
      }
    } catch (error) {
      // console.log(error);
      return { result: false, record: error };
    }
    if (isSuccess !== false && nextRule.rules) {
      return await this.runEngine(factReqs, nextRule, facts);
    }
    let ruleResult = [...this.result];
    this.result.length = 0;
    return ruleResult;
  }


  /**
  * 初始化engine
  * @private
  * @param {*} rules
  * @returns
  * @memberof JsonRuleModel
  */
  private createEngine(factReqs: any, rules: any) {

    const engine = new Engine();

    const facts = [];

    for (let factReq of factReqs) {
      const factService = new this.factServiceSet[factReq.serviceName](this.config);
      facts.push(this.getFact(factReq.factName, factService, factReq.functionName, factReq.isCache));
    }

    // engine.addOperator(new Operator('anyIn', (a, b) => { console.log('1234', a, b); return true; }), Array.isArray);

    for (let fact of facts) {
      engine.addFact(fact);
    }

    for (let rule of rules) {
      engine.addRule(rule);
    }

    return engine;
  }

  /**
   * 取得動態fact
   * @param {*} factName
   * @param {*} factService
   * @param {*} functionName
   * @param {*} isCache
   * @returns {Fact}
   * @memberof RuleEngine
   */
  public getFact(factName: string, factService: string, functionName: string, isCache: boolean): Fact {

    return new Fact(factName,
      async (params, almanac) => {

        const factValue = Array.from(almanac.factMap.values());
        const factParams = { ...params };
        factValue.forEach((item: any) => {
          if (!item.id || !item.value) { return; }
          factParams[item.id] = item.value;
        });
        return factService[functionName](factParams);
      }, { cache: isCache }
    );
  }

}