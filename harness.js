var document = { getElementById: function(){ return null; }, addEventListener: function(){}, body: { style: {} }, readyState: 'complete' };
var window = { __adobe_cep__: { getSystemPath: function(){ return ''; }, getFolderPath: function(){ return ''; } }, addEventListener: function(){}, location: { reload: function(){} } };
global.document = document;
global.window = window;
try { require('C:/Users/antho/Downloads/scripts/FlowBackground/panel-extension/js/panel.js'); console.log('LOADED OK'); }
catch (e) { console.log('ERROR:', e && e.stack ? e.stack : e); }