import Router from "next/router";

import "@yaireo/tagify/dist/tagify.css";
import "react-datepicker/dist/react-datepicker.css";

// eslint-disable-next-line @typescript-eslint/no-unused-vars
import initFirebase from "../utilities/initFirebase";

import { AuthProvider } from "../utilities/auth/useUser";

import NProgress from "nprogress";
import "nprogress/nprogress.css";

import "../styles/app.scss";

Router.events.on("routeChangeStart", () => NProgress.start());
Router.events.on("routeChangeComplete", () => NProgress.done());
Router.events.on("routeChangeError", () => NProgress.done());

// eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
const App = ({ Component, pageProps }) => {
    return (
        <AuthProvider>
            <Component {...pageProps} />
        </AuthProvider>
    );
};

export default App;
