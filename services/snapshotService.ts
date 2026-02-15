import { AppSnapshot, SnapshotService } from '../types';

const STORAGE_KEY = 'glassforge_snapshots';

export class LocalStorageSnapshotService implements SnapshotService {
  private getSnapshots(): AppSnapshot[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading snapshots from localStorage:', error);
      return [];
    }
  }

  private saveSnapshots(snapshots: AppSnapshot[]): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshots));
    } catch (error) {
      console.error('Error saving snapshots to localStorage:', error);
    }
  }

  saveSnapshot(snapshot: AppSnapshot): void {
    const snapshots = this.getSnapshots();
    // Remove existing snapshot with same ID if it exists (for updates)
    const filteredSnapshots = snapshots.filter((s) => s.id !== snapshot.id);
    filteredSnapshots.push(snapshot);
    this.saveSnapshots(filteredSnapshots);
    console.log(`Snapshot '${snapshot.description}' (${snapshot.id}) saved.`);
  }

  listSnapshots(): AppSnapshot[] {
    return this.getSnapshots().sort((a, b) => (
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    ));
  }

  loadSnapshot(id: string): AppSnapshot | null {
    const snapshots = this.getSnapshots();
    const snapshot = snapshots.find((s) => s.id === id);
    if (!snapshot) {
      console.warn(`Snapshot with ID '${id}' not found.`);
    } else {
      console.log(`Snapshot '${snapshot.description}' (${snapshot.id}) loaded.`);
    }
    return snapshot || null;
  }

  deleteSnapshot(id: string): void {
    let snapshots = this.getSnapshots();
    const initialLength = snapshots.length;
    snapshots = snapshots.filter((s) => s.id !== id);
    if (snapshots.length < initialLength) {
      this.saveSnapshots(snapshots);
      console.log(`Snapshot with ID '${id}' deleted.`);
    } else {
      console.warn(`Snapshot with ID '${id}' not found for deletion.`);
    }
  }
}
