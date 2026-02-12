declare module "react-native-sqlite-storage" {
  export interface SQLiteDatabase {
    executeSql(sql: string, args?: any[]): Promise<[{ rows: { item(idx: number): any; length: number } }]>;
  }

  export interface SQLiteOpenOptions {
    name: string;
    location?: string;
    createFromLocation?: string;
  }

  const SQLite: {
    enablePromise(enable: boolean): void;
    openDatabase(options: SQLiteOpenOptions): Promise<SQLiteDatabase>;
  };

  export default SQLite;
}
