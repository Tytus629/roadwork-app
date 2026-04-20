// src/export/shareCsv.ts
//
// Write a CSV string to a temp file and open the system share sheet.

import RNFS from "react-native-fs";
import Share from "react-native-share";

export async function shareCsvFile(args: { filename: string; csv: string }) {
  const path = `${RNFS.CachesDirectoryPath}/${args.filename}`;
  await RNFS.writeFile(path, args.csv, "utf8");

  await Share.open({
    title: args.filename,
    url: `file://${path}`,
    type: "text/csv",
    failOnCancel: false,
  });
}
