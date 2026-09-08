import type { Metadata } from "next";
import "./globals.css";
export const metadata:Metadata={title:"Access Lens | Permission Design Workspace",description:"Design, test and audit role-based access before it reaches production.",other:{"codex-preview":"development"},icons:{icon:"/favicon.svg"}};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body>{children}</body></html>}
