"use strict";Object.defineProperties(exports,{__esModule:{value:!0},[Symbol.toStringTag]:{value:"Module"}});const i=require("@opencode/plugin/gui"),o=i.Plugin.define({os:["windows"],setup(e){const t=Number(e.options.inset),n=Number.isFinite(t)?`${t}px`:"env(titlebar-area-x, 0px)";e.add(i.Style,`header[data-slot="titlebar-v2"] {
  margin-left: ${n} !important;
}`)}});exports.default=o;
