var document = { getElementById: function(){ return null; }, addEventListener: function(){}, body: { style: {} }, readyState: 'complete' };
var window = { __adobe_cep__: { getSystemPath: function(){ return ''; }, getFolderPath: function(){ return ''; } }, addEventListener: function(){}, location: { reload: function(){} } };
global.document = document;
global.window = window;
try { require('C:/Users/antho/AppData/Roaming/Adobe/CEP/extensions/com.antho.flowbg.panel/js/panel.js'); console.log('LOADED OK'); }
catch (e) { console.log('ERROR:', e && e.stack ? e.stack : e); }