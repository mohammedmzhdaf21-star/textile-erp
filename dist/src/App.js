"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const react_router_dom_1 = require("react-router-dom");
const auth_1 = require("./lib/auth");
const Login_1 = __importDefault(require("./pages/Login"));
const Dashboard_1 = __importDefault(require("./pages/Dashboard"));
// ============================================================
// PROTECTED ROUTE WRAPPER
// ============================================================
function ProtectedRoute({ children }) {
    if (!(0, auth_1.isAuthenticated)()) {
        return <react_router_dom_1.Navigate to="/login" replace/>;
    }
    return <>{children}</>;
}
// ============================================================
// MAIN APP
// ============================================================
function App() {
    return (<react_router_dom_1.BrowserRouter>
      <react_router_dom_1.Routes>
        <react_router_dom_1.Route path="/login" element={<Login_1.default />}/>
        <react_router_dom_1.Route path="/dashboard" element={<ProtectedRoute>
              <Dashboard_1.default />
            </ProtectedRoute>}/>
        <react_router_dom_1.Route path="/" element={<react_router_dom_1.Navigate to="/dashboard" replace/>}/>
        <react_router_dom_1.Route path="*" element={<react_router_dom_1.Navigate to="/login" replace/>}/>
      </react_router_dom_1.Routes>
    </react_router_dom_1.BrowserRouter>);
}
exports.default = App;
//# sourceMappingURL=App.js.map