const antlr4 = require('antlr4');
const Operator = require('./operator');
const { RiScriptVisitor } = require('../grammar/.antlr/RiScriptVisitor');
const { RiScriptParser } = require('../grammar/.antlr/RiScriptParser');
const EmptyExpr = new RiScriptParser.ExprContext();

/*
 * This Visitor walks the tree generated by a parser, evaluating
 * each node as it goes
 */
class Visitor extends RiScriptVisitor {

  constructor(parent, context, opts) {
    super();
    this.parent = parent;
    this.pendingSymbols = [];
    this.context = context || {};
    this.trace = opts && opts.trace;
  }

  // Entry point for tree visiting
  start(ctx) {
    return this.visitScript(ctx).trim();
  }

  /* visit value and create a mapping in the symbol table */
  visitAssign(ctx) {
    // TODO: test with transforms
    let token = ctx.expr();
    let id = symbolName(ctx.symbol().getText());
    this.trace && console.log('visitAssign: '
      + id + '=' + this.flatten(token) + ']');
    this.context[id] = this.visit(token);
    return ''; // no output on vanilla assign
  }

  visitChoice(ctx) {

    let options = [];

    // compute all options based on their weights
    ctx.wexpr().map((w, k) => {
      let wctx = w.weight();
      let weight = wctx ? parseInt(wctx.INT()) : 1;
      let expr = w.expr() || emptyExpr();
      for (let i = 0; i < weight; i++) {
        options.push(expr);
      }
    });

    // then pick a random one
    let token = randomElement(options) || emptyExpr();

    // merge transforms on entire choice and selected option
    token.transforms = this.inheritTransforms(token, ctx);
    this.trace && console.log('visitChoice: ' + this.flatten(token),
      "tfs=" + (token.transforms && token.transforms.length || "[]"));

    // 2nd half is to handle ().func() transforms (TODO: Remove when no longer needed -> use .func() instead?)
    return token.getText().length ? this.visit(token)
      : this.handleTransforms('', token.transforms);
  }

  visitCexpr(ctx) {
    let conds = ctx.cond();
    this.trace && console.log('visitCexpr(' + ctx.expr().getText() + ')',
      'cond={' + conds.map(c => c.getText().replace(',', '')) + '}');
    for (let i = 0; i < conds.length; i++) {
      let id = conds[i].SYM().getText().replace(/^\$/, '');
      let op = Operator.fromString(conds[i].op().getText());
      let val = conds[i].chars().getText();
      let sym = this.context[id];
      let accept = sym ? op.invoke(sym, val) : false;
      /* this.trace && console.log('  cond(' + ctx.getText() + ')',
        id, op.toString(), val, '->', accept); */
      if (!accept) return this.visitExpr(emptyExpr());
    }
    return this.visitExpr(ctx.expr());
  }

  visitExpr(ctx) {
    this.trace && console.log('visitExpr("' + ctx.getText() + '"): tfs=' + (ctx.transforms || "[]"));//  ctx.children[0]);
    let result = this.visitChildren(ctx);
    return result;
  }


  /* output expr value and create a mapping in the symbol table */
  visitInline(ctx) {
    //this.visitAssign(ctx);
    let orig = ctx.getText();
    let token = ctx.expr();
    let tokText = token.getText();
    let id = symbolName(ctx.symbol().getText());
    token.transforms = this.inheritTransforms(token, ctx);

    this.trace && console.log('visitInline: ' + id + '=' +
      this.flatten(token) + ' tfs=[' + (token.transforms || '') + ']');

    this.context[id] = this.visit(token);
    this.trace && console.log('visitInline2: $' + id + '=' + this.context[id]);

    // if the inline is not fully resolved, save it for next time
    if (/(\$|[()])/.test(this.context[id])) {
      this.pendingSymbols.push(id);
      //console.log('HIT', rs, this.pendingSymbols);
      return orig.replace(tokText, this.context[id]);
    }
    return this.context[id];
  }



  /* visit the resolved symbol */
  visitSymbol(ctx) {

    let ident = ctx.SYM();
    if (!ident) { // hack: for blank .func() cases
      //console.log('HIT', ctx.transform().length);
      return this.handleTransforms('', ctx.transform());
    }
    ident = ident.getText().replace(/^\$/, ''); // strip $

    // the symbol is pending so just return it
    if (this.pendingSymbols.includes(ident)) return '$' + ident;

    let text = this.context[ident] || '$' + ident;

    // hack to pass transforms along to visitTerminal
    let textContext = { text, getText: () => text };
    textContext.transforms = ctx.transforms || [];
    ctx.transform().map(t => textContext.transforms.push(t.getText()));

    this.trace && console.log('visitSymbol($' + ident + ')'
      + ' tfs=[' + (textContext.transforms || '') + '] ctx[\''
      + ident + '\']=' + (ident === 'RiTa' ? '{RiTa}' : textContext.text));
    /* 
        let resolution = ;
        if (false && /[\$()]/.test(resolution)) { // cannot resolve yet
          return '$' + ident;
        } */
    return this.visitTerminal(textContext);
  }

  visitTerminal(ctx) {

    let term = ctx;
    if (typeof ctx.getText === 'function') {
      term = ctx.getText();
    }
    let tfs = ctx.transforms;
    if (typeof term === 'string') {
      if (term === Visitor.EOF) return '';

      term = this.parent.normalize(term);

      this.trace && /\S/.test(term) && console.log
        ('visitTerminal("' + term + '") tfs=[' + (tfs || '') + ']');

      // Handle unresolved symbols and groups by simply
      // re-appending transforms to be handled in next pass
      if (/([()]|\$[A-Za-z_][A-Za-z_0-9-]*)/.test(term)) {
        return term + (tfs ? tfs.reduce((acc, val) => acc +
          (typeof val === 'string' ? val : val.getText()), '') : '');
      }
    } else if (typeof term === 'object') {
      // Here we've resolved a symbol to an object in visitSymbol
      this.trace && console.log('visitTerminal2(' + (typeof term) + '): "'
        + JSON.stringify(term) + '" tfs=[' + (tfs || '') + ']');
    }
    else {
      this.trace && console.log('visitTerminal2(""): tfs=[' + (tfs || '') + ']');
    }
    return this.handleTransforms(term, tfs);
  }


  // ---------------------- Helpers ---------------------------

  isParseable(s) {
    return /([()]|\$[A-Za-z_][A-Za-z_0-9-]*)/.test(s);
  }

  /* run the transforms and return the results */
  handleTransforms(obj, transforms) {
    let term = obj;
    if (transforms && transforms.length) {
      let tfs = this.trace ? '' : null; // debugging
      for (let i = 0; i < transforms.length; i++) {
        let transform = transforms[i];
        transform = (typeof transform === 'string') ? transform : transform.getText();

        this.trace && (tfs += transform); // debugging
        let comps = transform.split('.');
        for (let j = 1; j < comps.length; j++) {
          let comp = comps[j];
          if (comp.length) {
            if (comp.endsWith(Visitor.FUNCTION)) {
              comp = comp.substring(0, comp.length - 2);
              if (typeof term[comp] === 'function') {
                term = term[comp]();
              }
              else {
                throw Error('Expecting ' + term + '.' + comp + ' to be a function');
              }
            } else if (term.hasOwnProperty(comp)) { // property
              if (typeof term[comp] === 'function') {
                throw Error('Functions with args not yet supported: $object.' + comp + '(...)');
              }
              term = term[comp];
            } else {
              term = term + '.' + comp; // no-op
            }
          }
        }
      }
      this.trace //&& (typeof obj !== 'string' || obj.trim().length)
        && console.log('handleTransforms: ' + (obj.length ? obj : "''") + tfs + ' -> ' + term);
    }
    return term;
  }

  getRuleName(ctx) {
    return ctx.hasOwnProperty('symbol') ?
      this.parent.lexer.symbolicNames[ctx.symbol.type] :
      this.parent.parser.ruleNames[ctx.ruleIndex];
  }

  countChildRules(ctx, ruleName) {
    let count = 0;
    for (let i = 0; i < ctx.getChildCount(); i++) {
      if (this.getRuleName(ctx.getChild(i)) === ruleName) count++;
    }
    return count;
  }

  printChildren(ctx) {
    for (let i = 0; i < ctx.getChildCount(); i++) {
      let child = ctx.getChild(i);
      console.log('  child' + i + ':', child.getText(), 'type=' + this.getRuleName(child));
    }
  }

  flatten(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', '');
  }

  flattenChoice(toks) {
    if (!Array.isArray(toks)) toks = [toks];
    return toks.reduce((acc, t) => acc += '[' + this.getRuleName(t) + ':' + t.getText() + ']', 'choice: ');
  }


  inheritTransforms(token, ctx) {
    let ctxTransforms = ctx.transform ? ctx.transform().map(t => t.getText()) : [];
    ctxTransforms = mergeArrays(ctxTransforms, ctx.transforms);
    if (typeof token.transforms === 'undefined') return ctxTransforms;
    return mergeArrays(token.transforms, ctxTransforms);
  }

  handleEmptyChoices(ctx, options) {
    let ors = this.countChildRules(ctx, Visitor.OR);
    let exprs = this.countChildRules(ctx, "expr");
    let adds = (ors + 1) - exprs;
    for (let i = 0; i < adds; i++) {
      options.push(emptyExpr());
    }
  }

  visitChildren(ctx) {
    if (!ctx.children) return ''; 
    //console.log('visitChildren: "'+ctx.getText()+'"', ctx.transforms, ctx.children.length, ctx.constructor.name);

    // we don't want characters to be split up before applying tgransforms
    if (ctx.constructor.name === 'CharsContext') { // yuck
      return this.handleTransforms(ctx.getText(), ctx.transforms);
    }
    
    return ctx.children.reduce((acc, child) => {
      child.transforms = ctx.transforms;//typeof ctx.transform === 'function' ? this.inheritTransforms(child, ctx) : ctx.transforms;
      return acc + this.visit(child);
    }, '');
  }
}

function randomElement(arr) {
  return arr[Math.floor((Math.random() * arr.length))];
}

function symbolName(text) {
  return (text.length && text[0] === Visitor.SYM) ? text.substring(1) : text;
}

function mergeArrays(orig, adds) {
  return (adds && adds.length) ? (orig || []).concat(adds) : orig;
}

function inspect(o) {
  let props = [];
  let obj = o;
  do {
    props = props.concat(Object.getOwnPropertyNames(obj));
  } while (obj = Object.getPrototypeOf(obj));
  return props.sort().filter(function (e, i, arr) {
    return (e != arr[i + 1]);// && typeof o[e] === 'function');
  });
}

function typeOf(o) {
  if (typeof o !== 'object') return typeof o;
  return Array.isArray(o) ? 'array' : 'object';
}

function emptyExpr() {
  delete EmptyExpr.transforms;
  return EmptyExpr;
}

Visitor.LP = '(';
Visitor.RP = ')';
Visitor.OR = 'OR';
Visitor.SYM = '$';
Visitor.EOF = '<EOF>';
Visitor.ASSIGN = '[]';
Visitor.FUNCTION = '()';

module.exports = Visitor;
