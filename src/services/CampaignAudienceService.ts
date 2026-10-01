import axios from 'axios';
import { validateEnv } from '../config/env';
import logger from '../config/logger';

export class CampaignAudienceService {
  /**
   * Fetch all matching user IDs from user-service using filters
   */
  static async resolveAudience(filters: Record<string, any>): Promise<string[]> {
    const env = validateEnv();
    const userServiceUrl = env.USER_SERVICE_URL;

    if (!userServiceUrl) {
      logger.warn('USER_SERVICE_URL is not configured. Cannot resolve audience.');
      return [];
    }

    const serviceToken = env.SERVICE_AUTH_TOKEN || '';
    const userIdsSet = new Set<string>();

    let currentPage = 1;
    let totalPages = 1;
    const limit = 500; // Resolve in large chunk size to optimize HTTP requests count

    try {
      do {
        logger.info(`Resolving audience page ${currentPage} from user-service...`);
        const response = await axios.get(
          `${userServiceUrl.replace(/\/$/, '')}/api/v1/users`,
          {
            headers: {
              'X-Service-Auth': serviceToken,
              'X-Service-Name': 'notification-service',
            },
            params: {
              page: currentPage,
              limit,
              search: filters.search,
              status: filters.status,
              role: filters.role,
              category: filters.category,
              city: filters.city,
              workArea: filters.workArea,
              area: filters.area,
              isAadhaarVerified: filters.isAadhaarVerified,
              isCertified: filters.isCertified,
              createdFrom: filters.createdFrom,
              createdTo: filters.createdTo,
            },
            timeout: 10000,
          }
        );

        const responseData = response.data;
        const users = responseData?.data || [];
        const pagination = responseData?.pagination || {};
        
        totalPages = pagination.totalPages || 1;

        for (const user of users) {
          // Check for userId or uid in profile object
          const uid = user.userId || user.uid || user._id;
          if (uid) {
            userIdsSet.add(uid.toString());
          }
        }

        currentPage++;
      } while (currentPage <= totalPages);

      const allUserIds = Array.from(userIdsSet);
      logger.info(`Successfully resolved ${allUserIds.length} target user(s) for the campaign.`);
      return allUserIds;

    } catch (error: any) {
      logger.error('Error querying matching users from user-service:', {
        message: error?.message || 'Unknown error',
        status: error?.response?.status,
      });
      throw new Error(`Failed to resolve campaign audience: ${error?.message || 'Unknown error'}`);
    }
  }
}
