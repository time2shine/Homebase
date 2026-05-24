function evaluateMath(query) {

  let expression = query.replace(/^=/, '').replace(/x/gi, '*').trim();

  if (!/^[\d\.\s\+\-\*\/\%\^\(\)]+$/.test(expression)) return null;

  if (!/[\+\-\*\/\%\^]/.test(expression)) return null;



  try {

    const clean = expression.replace(/\s+/g, '');

    const parts = clean.split(/([\+\-\*\/\%\^])/).filter(p => p !== '');

    if (parts.length < 3) return null;



    const operators = [];

    const numbers = [];

    for (let i = 0; i < parts.length; i++) {

      if (['+','-','*','/','%','^'].includes(parts[i])) {

        operators.push(parts[i]);

      } else {

        const num = parseFloat(parts[i]);

        if (isNaN(num)) return null;

        numbers.push(num);

      }

    }

    if (numbers.length !== operators.length + 1) return null;



    const applyOp = (a, b, operator) => {

      switch (operator) {

        case '+': return a + b;

        case '-': return a - b;

        case '*': return a * b;

        case '/': return b === 0 ? 0 : a / b;

        case '%': return a % b;

        case '^': return Math.pow(a, b);

        default: return 0;

      }

    };



    for (let i = 0; i < operators.length; i++) {

      const operator = operators[i];

      if (['*', '/', '%', '^'].includes(operator)) {

        const result = applyOp(numbers[i], numbers[i + 1], operator);

        numbers.splice(i, 2, result);

        operators.splice(i, 1);

        i--;

      }

    }



    let finalResult = numbers[0];

    for (let i = 0; i < operators.length; i++) {

      finalResult = applyOp(finalResult, numbers[i + 1], operators[i]);

    }



    if (!isFinite(finalResult) || isNaN(finalResult)) return null;

    return Math.round(finalResult * 10000) / 10000;

  } catch (e) {

    return null;

  }

}



function evaluateUnits(query) {

  const regex = /^([\d\.]+)\s*([a-z]+)\s*(?:to|in)?\s*([a-z]+)$/i;

  const match = query.match(regex);

  if (!match) return null;



  const val = parseFloat(match[1]);

  const from = match[2].toLowerCase();

  const to = match[3].toLowerCase();



  const units = {

    kg: { type: 'weight', base: 1 },

    lbs: { type: 'weight', base: 0.453592 },

    lb: { type: 'weight', base: 0.453592 },

    m: { type: 'length', base: 1 },

    meter: { type: 'length', base: 1 },

    meters: { type: 'length', base: 1 },

    km: { type: 'length', base: 1000 },

    ft: { type: 'length', base: 0.3048 },

    feet: { type: 'length', base: 0.3048 },

    mi: { type: 'length', base: 1609.34 },

    mile: { type: 'length', base: 1609.34 },

    miles: { type: 'length', base: 1609.34 },

    c: { type: 'temp' },

    celsius: { type: 'temp' },

    f: { type: 'temp' },

    fahrenheit: { type: 'temp' }

  };



  if (!units[from] || !units[to]) return null;

  if (units[from].type !== units[to].type) return null;



  let result = null;

  if (units[from].type === 'temp') {

    if ((from === 'c' || from === 'celsius') && (to === 'f' || to === 'fahrenheit')) {

      result = (val * 9 / 5) + 32;

    } else if ((from === 'f' || from === 'fahrenheit') && (to === 'c' || to === 'celsius')) {

      result = (val - 32) * 5 / 9;

    }

  } else {

    const inBase = val * units[from].base;

    result = inBase / units[to].base;

  }



  if (result === null) return null;

  return parseFloat(result.toFixed(2));

}



/**

 * Checks if a query string is likely a direct URL, domain, or IP address.

 */

function isLikelyUrl(query) {

  const trimmedQuery = query.trim().toLowerCase();



  // 1. Exclude search phrases (anything with spaces)

  if (trimmedQuery.includes(' ')) {

    return false;

  }



  // 2. Check for explicit schemes (mailto:, magnet:, about:, view-source:)

  // Regex: Starts with alphanumeric, followed by chars, ending in colon (e.g., "mailto:")

  // We exclude 'localhost:' here to handle it specifically later

  if (/^[a-z][a-z0-9+.-]+:/i.test(trimmedQuery) && !trimmedQuery.startsWith('localhost:')) {

    return true;

  }



  // 3. Intranet Shortnames: Ends with a slash (e.g., "router/", "nas/")

  // This allows users to force navigation to a local host without a .com

  if (trimmedQuery.endsWith('/') && trimmedQuery.length > 1) {

    return true;

  }



  // 4. Localhost (explicit or with port)

  if (trimmedQuery.startsWith('localhost')) {

    return true;

  }



  // 5. IPv4 addresses

  if (/^(\d{1,3}\.){3}\d{1,3}(:\d+)?(\/.*)?$/.test(trimmedQuery)) {

    return true;

  }



  // 6. Standard Domain structure (example.com)

  if (/^([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/.*)?$/.test(trimmedQuery)) {

    return true;

  }



  return false;

}
