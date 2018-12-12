/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

import { ElementFactory } from '../elements/types';
import { elementStrings, functionHelp } from './index';

// This type is temporary for compatibility.  Replace with Function spec type when available.
type FunctionSpecFactory = () => {
  name: string;
  help: string;
  args?: {
    [arg: string]: {
      help: string;
    };
  };
};

export const applyElementStrings = (elements: ElementFactory[]) =>
  elements.map(spec => {
    const result = spec();
    const { name } = result;
    const strings = elementStrings[name];

    // If we have registered strings for this spec, we should replace any that are available.
    if (strings) {
      const { displayName, help } = strings;
      // If the function has a registered help string, replace it on the spec.
      if (help) {
        result.help = help;
      }

      if (displayName) {
        result.displayName = displayName;
      }
    }

    return () => result;
  });

export const applyFunctionStrings = (functions: FunctionSpecFactory[]) =>
  functions.map(spec => {
    const result = spec();
    const { name } = result;
    const helpStrings = functionHelp[name];
    // If we have registered strings for this spec, we should replace any that are available.
    if (helpStrings) {
      const { help } = helpStrings;
      // If the function has a registered help string, replace it on the spec.
      if (help) {
        result.help = help;
      }
      // If the spec has arguments, check for registered strings.
      if (result.args) {
        const helpArgs = helpStrings.args || {};
        const argNames = Object.keys(result.args);
        // For each arg name, if a string is registered, replace it.
        argNames.forEach(argName => {
          const argHelp = helpArgs[argName];
          if (argHelp && result.args) {
            result.args[argName].help = argHelp;
          }
        });
      }
    }
    return () => result;
  });
