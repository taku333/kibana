/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License;
 * you may not use this file except in compliance with the Elastic License.
 */

export const render = () => ({
  name: 'render',
  displayName: 'Element style',
  help: 'Setting for the container around your element',
  modelArgs: [],
  requiresContext: false,
  args: [
    {
      name: 'containerStyle',
      argType: 'containerStyle',
    },
    {
      name: 'css',
      displayName: 'CSS',
      help: 'A CSS stylesheet scoped to your element',
      argType: 'textarea',
      default: `".canvasRenderEl {

}"`,
      options: {
        confirm: 'Apply stylesheet',
      },
    },
  ],
});
