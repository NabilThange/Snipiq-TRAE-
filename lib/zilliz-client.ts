import { MilvusClient, DataType, MutationResult } from '@zilliz/milvus2-sdk-node';
import { RawZillizHit } from './types';

interface CodeChunk {
  id?: number | string;
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
    } catch (error: unknown) {
      console.error(`Error creating collection ${collectionName}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to create collection: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async insertVectors(data: CodeChunk[]): Promise<MutationResult> {
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
    } catch (error: unknown) {
      console.error('Error inserting vectors:', error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to insert vectors: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async searchVectors(vector: number[], sessionId: string, limit: number = 10): Promise<RawZillizHit[]> {
    try {
      console.log(`Searching for vectors with sessionId: ${sessionId}`);
      
      const searchResult = await this.client.search({
        collection_name: this.defaultCollectionName,
        vectors: [vector],
        limit: limit,
        output_fields: ['content', 'filePath', 'sessionId', 'lineNumber', 'score', 'id'], // Added id and score to output fields
        filter: `sessionId == "${sessionId}"`,
        metric_type: 'COSINE',
      });

      // 🔍 DEBUG: Let's see the actual structure
      console.log('Raw search result:', JSON.stringify(searchResult, null, 2));
      
      const results: RawZillizHit[] = [];
      
      if (searchResult.results && searchResult.results.length > 0 && Array.isArray(searchResult.results[0])) {
        (searchResult.results[0] as unknown[]).forEach((item: unknown) => {
          // Type guard to ensure item has expected properties
          if (typeof item === 'object' && item !== null &&
              'id' in item && (typeof (item as any).id === 'number' || typeof (item as any).id === 'string') &&
              'content' in item && typeof (item as any).content === 'string' &&
              'filePath' in item && typeof (item as any).filePath === 'string' &&
              'sessionId' in item && typeof (item as any).sessionId === 'string' &&
              'score' in item && typeof (item as any).score === 'number' &&
              'lineNumber' in item && typeof (item as any).lineNumber === 'number') {
            const hitItem = item as { id: number | string; content: string; filePath: string; sessionId: string; score: number; lineNumber: number; };
            results.push({
              id: typeof hitItem.id === 'string' ? parseInt(hitItem.id) : hitItem.id,
              content: hitItem.content,
              filePath: hitItem.filePath,
              sessionId: hitItem.sessionId,
              score: hitItem.score, // Use score directly
              lineNumber: hitItem.lineNumber,
            });
          } else {
            console.warn("Unexpected search result item format:", item);
          }
        });
      } else {
        console.log("No valid search results array found or unexpected structure:", searchResult);
      }
      
      console.log(`Found ${results.length} search results`);
      console.log('🔧 ZillizClient returning:', results.length, 'results');
      return results;
    } catch (error: unknown) {
      console.error('Error searching vectors:', error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to search vectors: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async queryBySessionId(sessionId: string): Promise<CodeChunk[]> {
    try {
      const queryResult = await this.client.query({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`,
        output_fields: ['content', 'filePath', 'embedding', 'sessionId', 'lineNumber', 'id'], // Added id and lineNumber to output fields
      });

      const results: CodeChunk[] = [];
      if (queryResult.data) {
        queryResult.data.forEach((item: unknown) => {
          // Type guard to ensure item has expected properties
          if (typeof item === 'object' && item !== null &&
              'id' in item && (typeof (item as any).id === 'number' || typeof (item as any).id === 'string') && // ID can be number or string
              'content' in item && typeof (item as any).content === 'string' &&
              'filePath' in item && typeof (item as any).filePath === 'string' &&
              'embedding' in item && Array.isArray((item as any).embedding) &&
              'sessionId' in item && typeof (item as any).sessionId === 'string' &&
              'lineNumber' in item && typeof (item as any).lineNumber === 'number') {
            const codeChunkItem = item as CodeChunk;
            results.push({
              id: typeof codeChunkItem.id === 'string' ? parseInt(codeChunkItem.id) : codeChunkItem.id,
              content: codeChunkItem.content,
              filePath: codeChunkItem.filePath,
              embedding: codeChunkItem.embedding,
              sessionId: codeChunkItem.sessionId,
              lineNumber: codeChunkItem.lineNumber,
            });
          } else {
            console.warn("Unexpected query result format:", item);
          }
        });
      }
      console.log(`Queried data for session ${sessionId}:`, results.length);
      return results;
    } catch (error: unknown) {
      console.error(`Error querying data for session ${sessionId}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to query session data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async getAllChunks(sessionId: string, limit: number = 1000): Promise<CodeChunk[]> {
    try {
      console.log(`Getting chunks for session: ${sessionId}`);
      const queryResult = await this.client.query({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`,
        output_fields: ['content', 'filePath', 'sessionId', 'lineNumber', 'id'], // Added id to output fields
        limit: limit
      });

      const results: CodeChunk[] = [];
      if (queryResult.data) {
        queryResult.data.forEach((item: unknown) => {
          // Type guard to ensure item has expected properties
          if (typeof item === 'object' && item !== null &&
              'id' in item && (typeof (item as any).id === 'number' || typeof (item as any).id === 'string') && // ID can be number or string
              'content' in item && typeof (item as any).content === 'string' &&
              'filePath' in item && typeof (item as any).filePath === 'string' &&
              'sessionId' in item && typeof (item as any).sessionId === 'string' &&
              'lineNumber' in item && typeof (item as any).lineNumber === 'number') {
            const codeChunkItem = item as CodeChunk;
            results.push({
              id: typeof codeChunkItem.id === 'string' ? parseInt(codeChunkItem.id) : codeChunkItem.id,
              content: codeChunkItem.content,
              filePath: codeChunkItem.filePath,
              embedding: [],
              sessionId: codeChunkItem.sessionId,
              lineNumber: codeChunkItem.lineNumber,
            });
          } else {
            console.warn("Unexpected getAllChunks result format:", item);
          }
        });
      }
      console.log(`Retrieved ${results.length} chunks`);
      return results;
    } catch (error: unknown) {
      console.error(`Error retrieving all chunks for session ${sessionId}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to retrieve all chunks: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async deleteSessionData(sessionId: string): Promise<MutationResult> {
    try {
      const result = await this.client.delete({
        collection_name: this.defaultCollectionName,
        filter: `sessionId == "${sessionId}"`,
      });
      console.log(`Data for session ${sessionId} deleted successfully:`, result);
      return result;
    } catch (error: unknown) {
      console.error(`Error deleting data for session ${sessionId}:`, error instanceof Error ? error.message : String(error));
      throw new Error(`Failed to delete session data: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export default ZillizClient; 