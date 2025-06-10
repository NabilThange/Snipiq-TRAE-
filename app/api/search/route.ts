import { NextRequest, NextResponse } from 'next/server';
import NovitaClient from '../../../lib/novita-client';
import ZillizClient from '../../../lib/zilliz-client';
import { SearchResult, RawZillizHit } from '../../../lib/types';

const novitaClient = new NovitaClient(process.env.NOVITA_API_KEY || '');

function getLanguageFromExtension(filePath: string): string {
  if (!filePath) return 'code';
  
  const ext = filePath.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'py': return 'python';
    case 'js': return 'javascript';
    case 'ts': return 'typescript';
    case 'jsx': return 'javascript';
    case 'tsx': return 'typescript';
    case 'html': return 'html';
    case 'css': return 'css';
    case 'java': return 'java';
    case 'cpp': case 'c++': return 'cpp';
    case 'c': return 'c';
    case 'php': return 'php';
    case 'rb': return 'ruby';
    case 'go': return 'go';
    case 'rs': return 'rust';
    default: return 'code';
  }
}

function extractFunctionName(content: string): string {
  if (!content) return '(ANONYMOUS CHUNK)';
  
  // Python function detection
  if (content.includes('def ')) {
    const match = content.match(/def\s+(\w+)\s*\(/);
    if (match) return match[1];
  }
  
  // JavaScript function detection
  if (content.includes('function')) {
    const match = content.match(/function\s+(\w+)\s*\(/);
    if (match) return match[1];
  }
  
  // Arrow function detection
  const arrowMatch = content.match(/const\s+(\w+)\s*=/);
  if (arrowMatch) return arrowMatch[1];
  
  return '(ANONYMOUS CHUNK)';
}

function generateTags(content: string): string[] {
  if (!content) return ['CODE'];
  
  const tags = [];
  
  // Python specific
  if (content.includes('def ')) tags.push('FUNCTION');
  if (content.includes('class ')) tags.push('CLASS');
  if (content.includes('import ')) tags.push('IMPORT');
  if (content.includes('print(')) tags.push('PRINT');
  
  // JavaScript specific
  if (content.includes('function')) tags.push('FUNCTION');
  if (content.includes('const') || content.includes('let') || content.includes('var')) tags.push('VARIABLE');
  if (content.includes('console.log')) tags.push('LOG');
  
  // General
  if (content.includes('//') || content.includes('#') || content.includes('/*')) tags.push('COMMENT');
  
  return tags.length > 0 ? tags : ['CODE'];
}

function getExtensionFromLanguage(language: string): string {
  switch (language) {
    case 'python': return '.py';
    case 'javascript': return '.js';
    case 'typescript': return '.ts';
    case 'html': return '.html';
    case 'css': return '.css';
    case 'java': return '.java';
    case 'cpp': return '.cpp';
    case 'c': return '.c';
    case 'php': return '.php';
    case 'ruby': return '.rb';
    case 'go': return '.go';
    case 'rust': return '.rs';
    default: return '.txt'; // Default to .txt for unknown or generic code
  }
}

function detectLanguageFromContent(content: string): string {
  if (!content) return 'code';
  
  // Python detection
  if (content.includes('print(') || content.includes('def ') || content.includes('import ')) {
    return 'python';
  }
  
  // JavaScript detection
  if (content.includes('console.log') || content.includes('function') || content.includes('=>')) {
    return 'javascript';
  }
  
  // Add more detection logic as needed
  return 'code';
}

export async function POST(req: NextRequest) {
  try {
    const { query, sessionId, limit = 5 } = await req.json();

    // Validate inputs
    if (!query || typeof query !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'Invalid or missing search query.',
        results: []
      }, { status: 400 });
    }

    if (!sessionId || typeof sessionId !== 'string') {
      return NextResponse.json({
        success: false,
        message: 'Invalid or missing sessionId.',
        results: []
      }, { status: 400 });
    }

    // Step 1: Generate embedding for user query
    console.log('Generating embedding for query:', query);
      const embeddingResponse = await novitaClient.generateEmbeddings(query);
    const queryEmbedding = embeddingResponse.data[0].embedding;
   
    // Step 2: Search Zilliz for similar vectors
    console.log('Searching Zilliz for similar vectors...');
    const zillizClient = new ZillizClient();
    const searchResponse: RawZillizHit[] = await zillizClient.searchVectors(queryEmbedding, sessionId, limit);

    console.log('🔍 DEBUG: Raw search results from database:', searchResponse);
    
    // Extract the actual results array
    const searchResults: RawZillizHit[] = searchResponse || [];
    console.log('Extracted results:', searchResults);
    searchResults.forEach((result: RawZillizHit, index: number) => {
      console.log(`Result ${index + 1}:`, {
        content: result.content?.substring(0, 100) + '...',
        sessionId: result.sessionId,
        similarity: result.similarity,
        filePath: result.filePath,
        lineNumber: result.lineNumber
      });
    });

    // Step 3: Format results for frontend
    const formattedResults: SearchResult[] = searchResults.map((hit: RawZillizHit) => {
      // Use actual file info if available, otherwise infer
      const detectedLanguage = detectLanguageFromContent(hit.content || '');
      const inferredExtension = getExtensionFromLanguage(detectedLanguage);

      const actualFilePath = hit.filePath && hit.filePath !== '' 
        ? hit.filePath 
        : `session-${hit.sessionId}/code-snippet${inferredExtension}`;
      const actualFileName = actualFilePath ? actualFilePath.split('/').pop() || '' : `unknown-file-${hit.sessionId}${inferredExtension}`;
      const actualExtension = actualFilePath ? `.${actualFilePath.split('.').pop()}` : inferredExtension;
      
      return {
        filePath: actualFilePath,
        content: hit.content || '',
        codeSnippet: hit.content || '', 
        similarity: hit.similarity || 0, 
        fileName: actualFileName,
        fileExtension: actualExtension,
        lineNumber: hit.lineNumber || 1,
        // Enhanced details
        language: getLanguageFromExtension(actualFilePath || '') || detectedLanguage,
        linesOfCode: hit.content ? hit.content.split('\n').length : 0,
        functionName: extractFunctionName(hit.content || ''),
        tags: generateTags(hit.content || ''),
        summary: `Code snippet from ${actualFilePath}`,
        mode: 'search'
      };
    });

    console.log('Final formatted results:', formattedResults);
    console.log('Results count:', formattedResults.length);
   
    return NextResponse.json({
      success: true,
      message: 'Search completed successfully.',
      results: formattedResults
    }, { status: 200 });
   
  } catch (error: any) {
    console.error('Search API error:', error);
      return NextResponse.json({
        success: false,
      message: 'Search failed: ' + error.message,
        results: []
    }, { status: 500 });
  }
}