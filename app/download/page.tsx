import React from "react";
import Link from "next/link";
import { DownloadCloud, Loader2 } from "lucide-react";
import { getDownloadLinks } from "../actions/download";
import DownloadPageClient from "./DownloadPageClient";

export default async function DownloadPage() {
  const downloadInfo = await getDownloadLinks();

  return <DownloadPageClient downloadInfo={downloadInfo} />;
}