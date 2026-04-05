import api from './api';

/**
 * Service for critical system management tasks.
 * ONLY accessible by administrative accounts with valid JWT.
 */
export const SystemService = {
    /**
     * Downloads an archive of all transaction and user data in JSON format.
     */
    async exportAllData() {
        const response = await api.get('/system/export');
        if (response.data.success) {
            const dataStr = JSON.stringify(response.data.data, null, 2);
            const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
            const exportFileDefaultName = `autospf_backup_${new Date().toISOString()}.json`;

            const linkElement = document.createElement('a');
            linkElement.setAttribute('href', dataUri);
            linkElement.setAttribute('download', exportFileDefaultName);
            linkElement.click();
        }
        return response.data;
    },

    /**
     * Triggers a cloud-based backup of the MongoDB Atlas cluster.
     */
    async backupDatabase() {
        const response = await api.post('/system/backup');
        return response.data;
    },

    /**
     * Purges server-side caches and temporary memory segments.
     */
    async clearCache() {
        const response = await api.post('/system/clear-cache');
        return response.data;
    },

    /**
     * Irreversibly deletes all application data except the current admin.
     * WARNING: Use with extreme caution.
     */
    async resetSystem() {
        const response = await api.post('/system/reset');
        return response.data;
    }
};
