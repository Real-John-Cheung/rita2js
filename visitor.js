const RitaScriptVisitor = require('./lib/RitaScriptVisitor').RitaScriptVisitor;

/**
 * This Visitor walks the tree generated by parsers and produces Python code
 *
 * @returns {object}
 */
class Visitor extends RitaScriptVisitor {

  constructor(context) {
    super();
    this.context = context || {};
  }

  /**
   * Entry point of tree visiting
   *
   * @param {object} ctx
   * @returns {string}
   */
  start(ctx) {
    return this.visitScript(ctx);
  }

  // Visits children of current node
  visitChildren(ctx) {
    let code = '';
    for (let i = 0; i < ctx.getChildCount(); i++) {
      code += this.visit(ctx.getChild(i));
    }
    return code.trim();
  }

  // Visits a leaf node and returns a string
  visitTerminal(ctx) {
    //console.log('visitTerminal -> "' + ctx.getText() + '"');
    return ctx.getText();
  }

  visitScript(ctx) {
    //console.log('visitScript -> "' + ctx.getText() + '"');
    return this.visitChildren(ctx);
  };

  visitExpr(ctx) {
    //console.log('visitExpr -> "' + ctx.getText() + '"');
    return this.visitChildren(ctx);
  };

  visitChoice(ctx) {

    let dbug = 0;
    let children = [];
    dbug && console.log('visitChoice -> "' + ctx.getText() + '"');
    for (let i = 0; i < ctx.getChildCount(); i++) {
      let child = ctx.getChild(i);
      if (child.children) {
        // let visited = this.visitChildren(child);
        dbug && console.log('  ',children.length, child.getText());// child.getChildCount());//, this.visitTerminal(child));
        children.push(child);
      }
    }
    let idx  = Math.floor((Math.random()*children.length));
    dbug && console.log('  picked-idx', idx);
    let result = this.visit(children[idx]);
    dbug && console.log('  result', result);
    return result;
  };

  visitSymbol(ctx) {
    //console.log('visitSymbol -> "' + ctx.getText() + '" -> '+this.context[ctx.getText()]);
    let text = ctx.getText();
    return this.context[text] || text;
  };
}

module.exports = Visitor;
