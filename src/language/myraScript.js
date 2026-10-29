/**
 * ⚡ MYRA SELF-EXPANDING ENGINE — MYRASCRIPT DSL & RUNTIME
 * Sandboxed, human-readable domain-specific programming language for AI automations.
 * Includes Lexer, AST Parser, Sandboxed Interpreter with step ceilings,
 * and Two-Way Transpiler (MyraScript <-> JS/Python).
 */

// ============================================================================
// 1. LEXER / TOKENIZER
// ============================================================================

export const TOKEN_TYPES = {
  KEYWORD: 'KEYWORD',
  DOMAIN_VERB: 'DOMAIN_VERB',
  IDENTIFIER: 'IDENTIFIER',
  NUMBER: 'NUMBER',
  STRING: 'STRING',
  BOOLEAN: 'BOOLEAN',
  PUNCTUATION: 'PUNCTUATION',
  OPERATOR: 'OPERATOR',
  EOF: 'EOF',
};

const KEYWORDS = new Set([
  'let', 'set', 'if', 'else', 'for', 'in', 'repeat', 'times',
  'try', 'catch', 'return', 'fn', 'end', 'true', 'false', 'null'
]);

const DOMAIN_VERBS = new Set([
  'research', 'download', 'summarize', 'notify',
  'schedule', 'remember', 'drive_upload', 'minecraft_command'
]);

export class Lexer {
  constructor(source) {
    this.source = source || '';
    this.cursor = 0;
    this.line = 1;
    this.col = 1;
  }

  tokenize() {
    const tokens = [];
    while (this.cursor < this.source.length) {
      const char = this.source[this.cursor];

      // Skip whitespace
      if (/\s/.test(char)) {
        if (char === '\n') {
          this.line++;
          this.col = 1;
        } else {
          this.col++;
        }
        this.cursor++;
        continue;
      }

      // Comments: # or //
      if (char === '#' || (char === '/' && this.source[this.cursor + 1] === '/')) {
        while (this.cursor < this.source.length && this.source[this.cursor] !== '\n') {
          this.cursor++;
        }
        continue;
      }

      // Numbers
      if (/[0-9]/.test(char)) {
        let numStr = '';
        while (this.cursor < this.source.length && /[0-9.]/.test(this.source[this.cursor])) {
          numStr += this.source[this.cursor];
          this.cursor++;
          this.col++;
        }
        tokens.push({ type: TOKEN_TYPES.NUMBER, value: Number(numStr), line: this.line });
        continue;
      }

      // Strings
      if (char === '"' || char === "'") {
        const quote = char;
        this.cursor++;
        this.col++;
        let strVal = '';
        while (this.cursor < this.source.length && this.source[this.cursor] !== quote) {
          if (this.source[this.cursor] === '\\' && this.cursor + 1 < this.source.length) {
            this.cursor++;
            strVal += this.source[this.cursor];
          } else {
            strVal += this.source[this.cursor];
          }
          this.cursor++;
          this.col++;
        }
        this.cursor++; // close quote
        this.col++;
        tokens.push({ type: TOKEN_TYPES.STRING, value: strVal, line: this.line });
        continue;
      }

      // Operators
      if (['=', '!', '<', '>', '+', '-', '*', '/'].includes(char)) {
        let op = char;
        const nextChar = this.source[this.cursor + 1];
        if (['=', '>'].includes(nextChar) && ['=', '!', '<', '>'].includes(char)) {
          op += nextChar;
          this.cursor++;
          this.col++;
        }
        this.cursor++;
        this.col++;
        tokens.push({ type: TOKEN_TYPES.OPERATOR, value: op, line: this.line });
        continue;
      }

      // Punctuation
      if (['(', ')', '[', ']', '{', '}', ',', ':', ';'].includes(char)) {
        tokens.push({ type: TOKEN_TYPES.PUNCTUATION, value: char, line: this.line });
        this.cursor++;
        this.col++;
        continue;
      }

      // Identifiers / Keywords
      if (/[a-zA-Z_]/.test(char)) {
        let ident = '';
        while (this.cursor < this.source.length && /[a-zA-Z0-9_]/.test(this.source[this.cursor])) {
          ident += this.source[this.cursor];
          this.cursor++;
          this.col++;
        }

        if (DOMAIN_VERBS.has(ident)) {
          tokens.push({ type: TOKEN_TYPES.DOMAIN_VERB, value: ident, line: this.line });
        } else if (KEYWORDS.has(ident)) {
          tokens.push({
            type: ident === 'true' || ident === 'false' ? TOKEN_TYPES.BOOLEAN : TOKEN_TYPES.KEYWORD,
            value: ident === 'true' ? true : ident === 'false' ? false : ident,
            line: this.line,
          });
        } else {
          tokens.push({ type: TOKEN_TYPES.IDENTIFIER, value: ident, line: this.line });
        }
        continue;
      }

      this.cursor++;
      this.col++;
    }

    tokens.push({ type: TOKEN_TYPES.EOF, value: null, line: this.line });
    return tokens;
  }
}

// ============================================================================
// 2. PARSER & AST
// ============================================================================

export class Parser {
  constructor(tokens) {
    this.tokens = tokens || [];
    this.pos = 0;
  }

  peek() {
    return this.tokens[this.pos] || { type: TOKEN_TYPES.EOF };
  }

  consume(expectedType = null, expectedValue = null) {
    const token = this.peek();
    if (expectedType && token.type !== expectedType) {
      throw new Error(`Syntax Error at line ${token.line}: Expected token type ${expectedType}, found ${token.type} (${token.value})`);
    }
    if (expectedValue && token.value !== expectedValue) {
      throw new Error(`Syntax Error at line ${token.line}: Expected '${expectedValue}', found '${token.value}'`);
    }
    this.pos++;
    return token;
  }

  parse() {
    const statements = [];
    while (this.peek().type !== TOKEN_TYPES.EOF) {
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    return { type: 'Program', body: statements };
  }

  parseStatement() {
    const token = this.peek();

    // Variable Declaration: let x = expr
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'let') {
      this.consume(); // let
      const name = this.consume(TOKEN_TYPES.IDENTIFIER).value;
      this.consume(TOKEN_TYPES.OPERATOR, '=');
      const init = this.parseExpression();
      return { type: 'VariableDeclaration', name, init };
    }

    // Assignment: set x = expr
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'set') {
      this.consume(); // set
      const name = this.consume(TOKEN_TYPES.IDENTIFIER).value;
      this.consume(TOKEN_TYPES.OPERATOR, '=');
      const value = this.parseExpression();
      return { type: 'Assignment', name, value };
    }

    // Return: return expr
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'return') {
      this.consume();
      const value = this.parseExpression();
      return { type: 'ReturnStatement', value };
    }

    // If Statement: if (cond) { ... } else { ... }
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'if') {
      this.consume(); // if
      const condition = this.parseExpression();
      let consequent = [];
      if (this.peek().value === '{') {
        this.consume(TOKEN_TYPES.PUNCTUATION, '{');
        while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
          consequent.push(this.parseStatement());
        }
        this.consume(TOKEN_TYPES.PUNCTUATION, '}');
      } else {
        consequent.push(this.parseStatement());
      }

      let alternate = null;
      if (this.peek().type === TOKEN_TYPES.KEYWORD && this.peek().value === 'else') {
        this.consume(); // else
        alternate = [];
        if (this.peek().value === '{') {
          this.consume(TOKEN_TYPES.PUNCTUATION, '{');
          while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
            alternate.push(this.parseStatement());
          }
          this.consume(TOKEN_TYPES.PUNCTUATION, '}');
        } else {
          alternate.push(this.parseStatement());
        }
      }

      return { type: 'IfStatement', condition, consequent, alternate };
    }

    // Repeat Loop: repeat 3 times { ... }
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'repeat') {
      this.consume(); // repeat
      const countExpr = this.parseExpression();
      if (this.peek().value === 'times') this.consume();
      const body = [];
      if (this.peek().value === '{') {
        this.consume(TOKEN_TYPES.PUNCTUATION, '{');
        while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
          body.push(this.parseStatement());
        }
        this.consume(TOKEN_TYPES.PUNCTUATION, '}');
      }
      return { type: 'RepeatStatement', count: countExpr, body };
    }

    // For Loop: for item in list { ... }
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'for') {
      this.consume(); // for
      const varName = this.consume(TOKEN_TYPES.IDENTIFIER).value;
      this.consume(TOKEN_TYPES.KEYWORD, 'in');
      const iterable = this.parseExpression();
      const body = [];
      if (this.peek().value === '{') {
        this.consume(TOKEN_TYPES.PUNCTUATION, '{');
        while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
          body.push(this.parseStatement());
        }
        this.consume(TOKEN_TYPES.PUNCTUATION, '}');
      }
      return { type: 'ForInStatement', variable: varName, iterable, body };
    }

    // Try-Catch: try { ... } catch (err) { ... }
    if (token.type === TOKEN_TYPES.KEYWORD && token.value === 'try') {
      this.consume(); // try
      this.consume(TOKEN_TYPES.PUNCTUATION, '{');
      const tryBlock = [];
      while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
        tryBlock.push(this.parseStatement());
      }
      this.consume(TOKEN_TYPES.PUNCTUATION, '}');

      this.consume(TOKEN_TYPES.KEYWORD, 'catch');
      let param = 'error';
      if (this.peek().value === '(') {
        this.consume(TOKEN_TYPES.PUNCTUATION, '(');
        param = this.consume(TOKEN_TYPES.IDENTIFIER).value;
        this.consume(TOKEN_TYPES.PUNCTUATION, ')');
      }
      this.consume(TOKEN_TYPES.PUNCTUATION, '{');
      const catchBlock = [];
      while (this.peek().value !== '}' && this.peek().type !== TOKEN_TYPES.EOF) {
        catchBlock.push(this.parseStatement());
      }
      this.consume(TOKEN_TYPES.PUNCTUATION, '}');

      return { type: 'TryCatchStatement', tryBlock, param, catchBlock };
    }

    // Expression Statement (e.g. domain verbs or function calls)
    const expr = this.parseExpression();
    return { type: 'ExpressionStatement', expression: expr };
  }

  parseExpression() {
    let left = this.parsePrimary();

    // Check for binary operators
    if (this.peek().type === TOKEN_TYPES.OPERATOR) {
      const op = this.consume(TOKEN_TYPES.OPERATOR).value;
      const right = this.parseExpression();
      return { type: 'BinaryExpression', operator: op, left, right };
    }

    return left;
  }

  parsePrimary() {
    const token = this.peek();

    // Grouping: ( expr )
    if (token.type === TOKEN_TYPES.PUNCTUATION && token.value === '(') {
      this.consume();
      const expr = this.parseExpression();
      this.consume(TOKEN_TYPES.PUNCTUATION, ')');
      return expr;
    }

    // Literals
    if (token.type === TOKEN_TYPES.NUMBER || token.type === TOKEN_TYPES.STRING || token.type === TOKEN_TYPES.BOOLEAN) {
      this.consume();
      return { type: 'Literal', value: token.value, rawType: token.type };
    }

    // Array Literal: [ a, b, c ]
    if (token.type === TOKEN_TYPES.PUNCTUATION && token.value === '[') {
      this.consume();
      const elements = [];
      while (this.peek().value !== ']' && this.peek().type !== TOKEN_TYPES.EOF) {
        elements.push(this.parseExpression());
        if (this.peek().value === ',') this.consume();
      }
      this.consume(TOKEN_TYPES.PUNCTUATION, ']');
      return { type: 'ArrayLiteral', elements };
    }

    // Domain Verbs: research("topic") or research "topic"
    if (token.type === TOKEN_TYPES.DOMAIN_VERB) {
      const verb = this.consume().value;
      const args = [];
      if (this.peek().value === '(') {
        this.consume();
        while (this.peek().value !== ')' && this.peek().type !== TOKEN_TYPES.EOF) {
          args.push(this.parseExpression());
          if (this.peek().value === ',') this.consume();
        }
        this.consume(TOKEN_TYPES.PUNCTUATION, ')');
      } else if (this.peek().type !== TOKEN_TYPES.EOF && this.peek().value !== '\n') {
        args.push(this.parseExpression());
      }
      return { type: 'DomainCall', verb, arguments: args };
    }

    // Identifier / Function Call
    if (token.type === TOKEN_TYPES.IDENTIFIER) {
      const name = this.consume().value;
      if (this.peek().value === '(') {
        this.consume();
        const args = [];
        while (this.peek().value !== ')' && this.peek().type !== TOKEN_TYPES.EOF) {
          args.push(this.parseExpression());
          if (this.peek().value === ',') this.consume();
        }
        this.consume(TOKEN_TYPES.PUNCTUATION, ')');
        return { type: 'CallExpression', callee: name, arguments: args };
      }
      return { type: 'Identifier', name };
    }

    throw new Error(`Unexpected token at line ${token.line}: ${token.type} (${token.value})`);
  }
}

// ============================================================================
// 3. SAFE SANDBOXED INTERPRETER
// ============================================================================

export class Interpreter {
  constructor(capabilities = {}) {
    this.capabilities = {
      research: async (topic) => `[Research dossier synthesized for ${topic}]`,
      download: async (url, format) => `[Downloaded ${format || 'mp4'} from ${url}]`,
      summarize: async (text) => `Summary: ${String(text).slice(0, 100)}...`,
      notify: async (dest, msg) => `[Dispatched notification to ${dest}: "${msg}"]`,
      schedule: async (delay, action) => `[Scheduled ${action} in ${delay}]`,
      remember: async (key, val) => `[Saved memory: ${key} = ${val}]`,
      drive_upload: async (path) => `[Uploaded to Drive: ${path}]`,
      minecraft_command: async (cmd) => `[Executed Minecraft command: /${cmd}]`,
      ...capabilities,
    };
    this.maxSteps = 5000; // Hard loop ceiling
    this.steps = 0;
    this.logs = [];
  }

  async run(ast, initialEnv = {}) {
    this.steps = 0;
    this.logs = [];
    const env = { ...initialEnv };
    return this.executeBlock(ast.body, env);
  }

  async executeBlock(statements, env) {
    let lastValue = null;
    for (const stmt of statements) {
      this.steps++;
      if (this.steps > this.maxSteps) {
        throw new Error(`ExecutionStepCeilingExceeded: Script exceeded safe limit of ${this.maxSteps} operations.`);
      }

      if (stmt.type === 'VariableDeclaration') {
        const val = await this.evaluate(stmt.init, env);
        env[stmt.name] = val;
      } else if (stmt.type === 'Assignment') {
        const val = await this.evaluate(stmt.value, env);
        env[stmt.name] = val;
      } else if (stmt.type === 'ReturnStatement') {
        return await this.evaluate(stmt.value, env);
      } else if (stmt.type === 'IfStatement') {
        const cond = await this.evaluate(stmt.condition, env);
        if (cond) {
          lastValue = await this.executeBlock(stmt.consequent, env);
        } else if (stmt.alternate) {
          lastValue = await this.executeBlock(stmt.alternate, env);
        }
      } else if (stmt.type === 'RepeatStatement') {
        const count = await this.evaluate(stmt.count, env);
        for (let i = 0; i < count; i++) {
          lastValue = await this.executeBlock(stmt.body, env);
        }
      } else if (stmt.type === 'ForInStatement') {
        const list = await this.evaluate(stmt.iterable, env);
        if (Array.isArray(list)) {
          for (const item of list) {
            env[stmt.variable] = item;
            lastValue = await this.executeBlock(stmt.body, env);
          }
        }
      } else if (stmt.type === 'TryCatchStatement') {
        try {
          lastValue = await this.executeBlock(stmt.tryBlock, env);
        } catch (err) {
          env[stmt.param] = err.message;
          lastValue = await this.executeBlock(stmt.catchBlock, env);
        }
      } else if (stmt.type === 'ExpressionStatement') {
        lastValue = await this.evaluate(stmt.expression, env);
      }
    }
    return lastValue;
  }

  async evaluate(node, env) {
    if (!node) return null;

    if (node.type === 'Literal') {
      return node.value;
    }

    if (node.type === 'Identifier') {
      if (node.name in env) return env[node.name];
      return null;
    }

    if (node.type === 'ArrayLiteral') {
      const arr = [];
      for (const el of node.elements) {
        arr.push(await this.evaluate(el, env));
      }
      return arr;
    }

    if (node.type === 'BinaryExpression') {
      const left = await this.evaluate(node.left, env);
      const right = await this.evaluate(node.right, env);
      switch (node.operator) {
        case '+': return left + right;
        case '-': return left - right;
        case '*': return left * right;
        case '/': return right === 0 ? 0 : left / right;
        case '==': return left == right;
        case '!=': return left != right;
        case '<': return left < right;
        case '>': return left > right;
        case '<=': return left <= right;
        case '>=': return left >= right;
        default: return null;
      }
    }

    if (node.type === 'DomainCall') {
      const evaluatedArgs = [];
      for (const arg of node.arguments) {
        evaluatedArgs.push(await this.evaluate(arg, env));
      }
      const handler = this.capabilities[node.verb];
      if (typeof handler === 'function') {
        const res = await handler(...evaluatedArgs);
        this.logs.push(`[${node.verb}] -> ${JSON.stringify(res)}`);
        return res;
      }
      throw new Error(`DomainCapabilityNotConfigured: verb '${node.verb}' is not permitted or defined.`);
    }

    return null;
  }
}

// ============================================================================
// 4. TRANSPILER (MyraScript <-> JavaScript / Python)
// ============================================================================

export class MyraScriptTranspiler {
  /**
   * Transpile MyraScript code into safe async JavaScript
   */
  toJavaScript(myraCode) {
    const lexer = new Lexer(myraCode);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();

    const lines = ['// Auto-generated from MyraScript', 'export async function execute(capabilities, env = {}) {'];
    
    const translateNode = (stmt) => {
      if (stmt.type === 'VariableDeclaration') {
        return `  let ${stmt.name} = ${translateExpr(stmt.init)};`;
      }
      if (stmt.type === 'Assignment') {
        return `  ${stmt.name} = ${translateExpr(stmt.value)};`;
      }
      if (stmt.type === 'ReturnStatement') {
        return `  return ${translateExpr(stmt.value)};`;
      }
      if (stmt.type === 'IfStatement') {
        const cons = stmt.consequent.map(translateNode).join('\n');
        const alt = stmt.alternate ? ` else {\n${stmt.alternate.map(translateNode).join('\n')}\n  }` : '';
        return `  if (${translateExpr(stmt.condition)}) {\n${cons}\n  }${alt}`;
      }
      if (stmt.type === 'RepeatStatement') {
        return `  for (let _i = 0; _i < ${translateExpr(stmt.count)}; _i++) {\n${stmt.body.map(translateNode).join('\n')}\n  }`;
      }
      if (stmt.type === 'ForInStatement') {
        return `  for (const ${stmt.variable} of ${translateExpr(stmt.iterable)}) {\n${stmt.body.map(translateNode).join('\n')}\n  }`;
      }
      if (stmt.type === 'ExpressionStatement') {
        return `  await ${translateExpr(stmt.expression)};`;
      }
      return '';
    };

    const translateExpr = (expr) => {
      if (!expr) return 'null';
      if (expr.type === 'Literal') return JSON.stringify(expr.value);
      if (expr.type === 'Identifier') return expr.name;
      if (expr.type === 'BinaryExpression') {
        return `(${translateExpr(expr.left)} ${expr.operator === '==' ? '===' : expr.operator} ${translateExpr(expr.right)})`;
      }
      if (expr.type === 'ArrayLiteral') {
        return `[${expr.elements.map(translateExpr).join(', ')}]`;
      }
      if (expr.type === 'DomainCall') {
        return `capabilities.${expr.verb}(${expr.arguments.map(translateExpr).join(', ')})`;
      }
      return 'null';
    };

    for (const stmt of ast.body) {
      lines.push(translateNode(stmt));
    }
    lines.push('}');
    return lines.join('\n');
  }

  /**
   * Transpile MyraScript code into Python 3
   */
  toPython(myraCode) {
    const lexer = new Lexer(myraCode);
    const parser = new Parser(lexer.tokenize());
    const ast = parser.parse();

    const lines = ['# Auto-generated from MyraScript', 'def execute(capabilities, env=None):', '    env = env or {}'];

    const translateNode = (stmt, indent = '    ') => {
      if (stmt.type === 'VariableDeclaration' || stmt.type === 'Assignment') {
        return `${indent}${stmt.name} = ${translateExpr(stmt.init || stmt.value)}`;
      }
      if (stmt.type === 'ReturnStatement') {
        return `${indent}return ${translateExpr(stmt.value)}`;
      }
      if (stmt.type === 'IfStatement') {
        const cons = stmt.consequent.map(s => translateNode(s, indent + '    ')).join('\n') || `${indent}    pass`;
        let code = `${indent}if ${translateExpr(stmt.condition)}:\n${cons}`;
        if (stmt.alternate) {
          const alt = stmt.alternate.map(s => translateNode(s, indent + '    ')).join('\n') || `${indent}    pass`;
          code += `\n${indent}else:\n${alt}`;
        }
        return code;
      }
      if (stmt.type === 'RepeatStatement') {
        const body = stmt.body.map(s => translateNode(s, indent + '    ')).join('\n') || `${indent}    pass`;
        return `${indent}for _ in range(${translateExpr(stmt.count)}):\n${body}`;
      }
      if (stmt.type === 'ForInStatement') {
        const body = stmt.body.map(s => translateNode(s, indent + '    ')).join('\n') || `${indent}    pass`;
        return `${indent}for ${stmt.variable} in ${translateExpr(stmt.iterable)}:\n${body}`;
      }
      if (stmt.type === 'ExpressionStatement') {
        return `${indent}${translateExpr(stmt.expression)}`;
      }
      return `${indent}pass`;
    };

    const translateExpr = (expr) => {
      if (!expr) return 'None';
      if (expr.type === 'Literal') {
        if (expr.value === true) return 'True';
        if (expr.value === false) return 'False';
        if (expr.value === null) return 'None';
        return JSON.stringify(expr.value);
      }
      if (expr.type === 'Identifier') return expr.name;
      if (expr.type === 'BinaryExpression') {
        return `(${translateExpr(expr.left)} ${expr.operator} ${translateExpr(expr.right)})`;
      }
      if (expr.type === 'ArrayLiteral') {
        return `[${expr.elements.map(translateExpr).join(', ')}]`;
      }
      if (expr.type === 'DomainCall') {
        return `capabilities['${expr.verb}'](${expr.arguments.map(translateExpr).join(', ')})`;
      }
      return 'None';
    };

    for (const stmt of ast.body) {
      lines.push(translateNode(stmt));
    }
    return lines.join('\n');
  }

  /**
   * Helper to execute MyraScript directly with sandbox isolation
   */
  async execute(code, capabilities = {}, env = {}) {
    const lexer = new Lexer(code);
    const tokens = lexer.tokenize();
    const parser = new Parser(tokens);
    const ast = parser.parse();
    const interpreter = new Interpreter(capabilities);
    const result = await interpreter.run(ast, env);
    return {
      result,
      steps: interpreter.steps,
      logs: interpreter.logs,
    };
  }
}

export const myraScriptTranspiler = new MyraScriptTranspiler();
