import { MilvusClient, DataType } from '@zilliz/milvus2-sdk-node';
import { ZillizSearchResponse, RawZillizHit } from './types';

interface CodeChunk {
  id?: number;
  content: string;
  filePath: string;
  embedding: number[];
  sessionId: string;
  lineNumber: number;
}

class ZillizClient {
  private client: MilvusClient;
  private defaultCollectionName: string = 'code_embeddings';

  constructor() {
    const uri = process.env.ZILLIZ_CLOUD_URI;
    const token = process.env.ZILLIZ_CLOUD_TOKEN;
    
    if (!uri || !token) {
      throw new Error('Missing Zilliz credentials. Check ZILLIZ_CLOUD_URI and ZILLIZ_CLOUD_TOKEN in .env.local');
    }

    this.client = new MilvusClient({
      address: uri,
      token: token,
    });
  }

  async createCollection(collectionName: string, dimension: number): Promise<void> {
    try {
      const hasCollection = await this.client.hasCollection({ collection_name: collectionName });
      if (!hasCollection.value) {
        await this.client.createCollection({
          collection_name: collectionName,
          fields: [
            {
              name: "id",
              data_type: DataType.Int64,
              is_primary_key: true,
              autoID: true, // Corresponds to auto_id
            },
            {
              name: "embedding",
              data_type: DataType.FloatVector,
              dim: dimension,
            },
          ],
          metric_type: 'COSINE', // This is for the vector index
          enable_dynamic_field: true, // Allows flexible fields like filePath, content, sessionId
        });
        console.log(`Collection ${collectionName} created successfully.`);
      } else {
        console.log(`Collection ${collectionName} already exists.`);
      }
    } catch (error: any) {
      console.error(`Error creating collection ${collectionName}:`, error);
      throw new Error(`Failed to create collection: ${error}`);
    }
  }

  async insertVectors(data: CodeChunk[]): Promise<any> {
    try {
      const formattedData = data.map(chunk => ({
        vector: chunk.embedding,
        content: chunk.content,
        filePath: chunk.filePath,
        sessionId: chunk.sessionId,
        lineNumber: chunk.lineNumber,
      }));

      const result = await this.client.insert({
        collection_name: this.defaultCollectionName,
        data: formattedData,
      });
      console.log('Vectors inserted successfully:', result);
      return result;
    } catch (error) {
      console.error('Error inserting vectors:', error);
      throw new Error(`Failed to insert vectors: ${error}`);
    }
  }

  async searchVectors(vector: number[], sessionId: string, limit: number = 10): Promise<RawZillizHit[]> {
    try {
      console.log(`Searching for vectors with sessionId: ${sessionId}`);
      
      const searchResult = await this.client.search({
        collection_name: this.defaultCollectionName,
        vectors: [vector],
        limit: limit,
        output_fields: ['content', 'filePath', 'sessionId', 'lineNumber'],
        filter: `sessionId == "${sessionId}"`,
        metric_type: 'COSINE',
      });

      // 🔍 DEBUG: Let's see the actual structure
      console.log('Raw search result:', JSON.stringify(searchResult, null, 2));
      console.log('searchResult.results:', JSON.stringify(searchResult.results, null, 2));
      
      const results: RawZillizHit[] = [];
      
      if (Array.isArray(searchResult.results)) {
        searchResult.results.forEach((hit: any) => {
          results.push({
            content: hit.content,
            filePath: hit.filePath, 
            sessionId: hit.sessionId,
            similarity: hit.score, // Use score from Zilliz
            lineNumber: hit.lineNumber,
          });
        });
      } 
      
      console.log(`Found ${results.length} search results`);
      console.log('🔧 ZillizClient returning:', results.length, 'results');
      return results;
    } catch (error: any) {
      console.error('Error searching vectors:', error);
      throw new Error(`Failed to search vectors: ${error}`);
    }
  }

  async queryBySessionId(sessionId: string): Promise<CodeChunk[]> {
    try {
      const queryResult = await this.client.query({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`,
        output_fields: ['content', 'filePath', 'embedding', 'sessionId'],
      });

      const results: CodeChunk[] = [];
      if (queryResult.data) {
        queryResult.data.forEach((item: any) => {
          results.push({
            id: item.id,
            content: item.content,
            filePath: item.filePath,
            embedding: item.embedding,
            sessionId: item.sessionId,
            lineNumber: item.lineNumber,
          });
        });
      }
      console.log(`Queried data for session ${sessionId}:`, results.length);
      return results;
    } catch (error: any) {
      console.error(`Error querying data for session ${sessionId}:`, error);
      throw new Error(`Failed to query session data: ${error}`);
    }
  }

  async getAllChunks(sessionId: string, limit: number = 1000): Promise<CodeChunk[]> {
    try {
      console.log(`Getting chunks for session: ${sessionId}`);
      const queryResult = await this.client.query({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`,
        output_fields: ['content', 'filePath', 'sessionId'],
        limit: limit
      });

      const results: CodeChunk[] = [];
      if (queryResult.data) {
        queryResult.data.forEach((item: any) => {
          results.push({
            id: item.id,
            content: item.content,
            filePath: item.filePath,
            embedding: [], // We don't need embeddings for summarization
            sessionId: item.sessionId,
            lineNumber: item.lineNumber,
          });
        });
      }
      console.log(`Retrieved ${results.length} chunks`);
      return results;
    } catch (error: any) {
      console.error(`Error retrieving all chunks for session ${sessionId}:`, error);
      throw new Error(`Failed to retrieve all chunks: ${error.message}`);
    }
  }

  // You might want methods for deleting collections/data by sessionId as well.
  async deleteSessionData(sessionId: string): Promise<any> {
    try {
      const result = await this.client.delete({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`, // Delete all data associated with the session
      });
      console.log(`Data for session ${sessionId} deleted successfully:`, result);
      return result;
    } catch (error: any) {
      console.error(`Error deleting data for session ${sessionId}:`, error);
      throw new Error(`Failed to delete session data: ${error}`);
    }
  }
}

export default ZillizClient; 